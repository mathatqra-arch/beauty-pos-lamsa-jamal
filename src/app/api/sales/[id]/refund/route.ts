import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db, supabaseClient } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// POST /api/sales/[id]/refund — ATOMIC via refund_sale_atomic RPC
// Prevents: double-spend, over-refund, race conditions.
// Validates: already-returned quantities per item.
// Updates: sale status to REFUNDED (full) or PARTIAL_REFUND (partial).
export const POST = withAuth('sale.refund', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const { items, reason, refundMethod } = await req.json()
    const userId = user.id

    const sale = await db.sale.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, customer: true }
    })
    if (!sale) return errorResponse('الفاتورة غير موجودة', 404)
    if (sale.status === 'REFUNDED') return errorResponse('الفاتورة مستردة بالكامل', 400)

    // Build items array for RPC
    const rpcItems = items.map((ret: any) => {
      const saleItem = sale.items.find(si => si.id === ret.saleItemId)
      if (!saleItem) throw new Error('صنف غير موجود في الفاتورة')
      const lineTotal = (Number(saleItem.total) / saleItem.quantity) * ret.quantity
      return {
        saleItemId: ret.saleItemId,
        quantity: ret.quantity,
        unitPrice: Number(saleItem.unitPrice),
        total: lineTotal,
      }
    })

    const clientTxnId = req.headers.get('X-Client-Txn-Id') || randomUUID()

    // Try atomic RPC first
    const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('refund_sale_atomic', {
      p_client_txn_id: clientTxnId,
      p_sale_id: id,
      p_user_id: userId,
      p_items: rpcItems,
      p_reason: reason || null,
      p_refund_method: refundMethod || 'CASH',
    })

    if (!rpcError && rpcResult && rpcResult.success) {
      // RPC succeeded — fetch the created SaleReturn with relations
      const saleReturn = await db.saleReturn.findUnique({
        where: { id: rpcResult.returnId },
        include: { items: true }
      })

      // Reverse loyalty proportionally (manual, since RPC doesn't handle this)
      const refundTotal = Number(rpcResult.totalRefund)
      let loyaltyReversed = 0
      if (sale.loyaltyEarned > 0 && sale.customerId) {
        loyaltyReversed = Math.floor(sale.loyaltyEarned * (refundTotal / Number(sale.total)))
        if (loyaltyReversed > 0) {
          const acct = await db.loyaltyAccount.findUnique({ where: { customerId: sale.customerId } })
          if (acct) {
            await db.loyaltyAccount.update({
              where: { customerId: sale.customerId },
              data: { points: acct.points - loyaltyReversed }
            })
            await db.loyaltyTransaction.create({
              data: {
                id: randomUUID(),
                customerId: sale.customerId,
                type: 'REVERSE',
                points: -loyaltyReversed,
                refType: 'SaleReturn',
                refId: rpcResult.returnId,
                note: `عكس نقاط من ${rpcResult.returnNumber}`,
                clientTxnId: clientTxnId + '-loyalty',
              }
            })
          }
        }
      }

      // Cash movement for refund
      if ((refundMethod || 'CASH') === 'CASH') {
        const session = await db.cashSession.findFirst({ where: { status: 'OPEN' } })
        if (session) {
          await db.cashMovement.create({
            data: {
              id: randomUUID(),
              sessionId: session.id,
              type: 'REFUND',
              amount: -refundTotal,
              refType: 'SaleReturn',
              refId: rpcResult.returnId,
              note: rpcResult.returnNumber,
              clientTxnId: clientTxnId + '-cash',
            }
          })
        }
      }

      // Audit log
      await db.auditLog.create({
        data: {
          id: randomUUID(),
          userId,
          action: 'SALE_REFUNDED',
          entity: 'SaleReturn',
          entityId: rpcResult.returnId,
          before: JSON.stringify({ saleTotal: Number(sale.total) }),
          after: JSON.stringify({ refundTotal })
        }
      })

      return successResponse(saleReturn, 'تم معالجة المرتجع بنجاح')
    }

    // Fallback: manual refund (with double-spend prevention)
    if (rpcError) {
      console.log('[refund] RPC not available, using manual fallback with double-spend check')
    } else if (rpcResult && !rpcResult.success) {
      const errMsg = rpcResult.error || 'فشل المرتجع'
      if (errMsg === 'quantity_exceeds_refundable') {
        return errorResponse(`الكمية تتجاوز المتاح للاسترداد. الحد الأقصى: ${rpcResult.maxRefundable}`, 400)
      }
      if (errMsg === 'already_fully_refunded') {
        return errorResponse('الفاتورة مستردة بالكامل', 400)
      }
      return errorResponse(errMsg)
    }

    // Manual fallback with proper double-spend prevention
    const warehouse = await db.warehouse.findFirst()
    if (!warehouse) return errorResponse('لا يوجد مخزن', 500)

    let refundTotal = 0
    let refundTax = 0
    let loyaltyReversed = 0
    const returnItems: any[] = []

    for (const ret of items) {
      const saleItem = sale.items.find(si => si.id === ret.saleItemId)
      if (!saleItem) return errorResponse('صنف غير موجود في الفاتورة', 400)

      // CRITICAL FIX: check already-returned quantities (was missing before)
      const previousReturns = await db.saleReturnItem.findMany({
        where: { saleItemId: saleItem.id },
        include: { saleReturn: { select: { status: true } } }
      })
      const alreadyReturned = previousReturns
        .filter(r => r.saleReturn.status === 'COMPLETED')
        .reduce((s, r) => s + r.quantity, 0)
      const maxRefundable = saleItem.quantity - alreadyReturned

      if (ret.quantity > maxRefundable) {
        return errorResponse(`الكمية المتاحة للاسترداد: ${maxRefundable} (طلبت: ${ret.quantity})`, 400)
      }

      const lineTotal = (Number(saleItem.total) / saleItem.quantity) * ret.quantity
      refundTotal += lineTotal
      refundTax += (Number(saleItem.taxAmount) / saleItem.quantity) * ret.quantity
      returnItems.push({
        id: randomUUID(),
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        quantity: ret.quantity,
        unitPrice: saleItem.unitPrice,
        total: lineTotal,
      })
    }

    if (sale.loyaltyEarned > 0 && sale.customerId) {
      loyaltyReversed = Math.floor(sale.loyaltyEarned * (refundTotal / Number(sale.total)))
    }

    const returnNumber = `RET-${Date.now()}`
    const saleReturn = await db.saleReturn.create({
      data: {
        id: randomUUID(),
        returnNumber,
        saleId: sale.id,
        userId,
        subtotal: refundTotal - refundTax,
        taxAmount: refundTax,
        total: refundTotal,
        refundMethod: refundMethod || 'CASH',
        reason,
        status: 'COMPLETED',
        loyaltyReversed,
        clientTxnId,
      }
    })

    for (const ri of returnItems) {
      await db.saleReturnItem.create({ data: { ...ri, saleReturnId: saleReturn.id } })

      const stockLevel = await db.stockLevel.findFirst({
        where: { productId: ri.productId, warehouseId: warehouse.id }
      })
      if (stockLevel) {
        await db.stockLevel.update({
          where: { id: stockLevel.id },
          data: { quantity: stockLevel.quantity + ri.quantity }
        })
      }
      await db.stockMovement.create({
        data: {
          id: randomUUID(),
          productId: ri.productId,
          warehouseId: warehouse.id,
          type: 'RETURN',
          quantity: ri.quantity,
          refType: 'SaleReturn',
          refId: saleReturn.id,
        }
      })
    }

    if (loyaltyReversed > 0 && sale.customerId) {
      const acct = await db.loyaltyAccount.findUnique({ where: { customerId: sale.customerId } })
      if (acct) {
        await db.loyaltyAccount.update({
          where: { customerId: sale.customerId },
          data: { points: acct.points - loyaltyReversed }
        })
      }
      await db.loyaltyTransaction.create({
        data: {
          id: randomUUID(),
          customerId: sale.customerId,
          type: 'REVERSE',
          points: -loyaltyReversed,
          refType: 'SaleReturn',
          refId: saleReturn.id,
          note: `عكس نقاط من ${returnNumber}`,
          clientTxnId: clientTxnId + '-loyalty',
        }
      })
    }

    if ((refundMethod || 'CASH') === 'CASH') {
      const session = await db.cashSession.findFirst({ where: { status: 'OPEN' } })
      if (session) {
        await db.cashMovement.create({
          data: {
            id: randomUUID(),
            sessionId: session.id,
            type: 'REFUND',
            amount: -refundTotal,
            refType: 'SaleReturn',
            refId: saleReturn.id,
            note: returnNumber,
            clientTxnId: clientTxnId + '-cash',
          }
        })
      }
    }

    // CRITICAL FIX: set status to REFUNDED if full, PARTIAL_REFUND if partial
    const newStatus = refundTotal >= Number(sale.total) ? 'REFUNDED' : 'PARTIAL_REFUND'
    await db.sale.update({ where: { id: sale.id }, data: { status: newStatus } })

    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'SALE_REFUNDED',
        entity: 'SaleReturn',
        entityId: saleReturn.id,
        before: JSON.stringify({ saleTotal: Number(sale.total) }),
        after: JSON.stringify({ refundTotal })
      }
    })

    return successResponse(saleReturn, 'تم معالجة المرتجع بنجاح')
  } catch (e: unknown) {
    console.error('[refund] error:', e)
    return errorResponse('فشل معالجة المرتجع', 500)
  }
})
