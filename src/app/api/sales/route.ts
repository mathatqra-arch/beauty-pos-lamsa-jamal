import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { randomUUID } from 'crypto'
import { db, supabaseClient } from '@/lib/db'
import { successResponse, errorResponse, getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Server-safe UUID generation (Node.js crypto, not browser)
function generateUUID(): string {
  return randomUUID()
}

// GET /api/sales - list with filters
export const GET = withAuth('sale.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const customerId = searchParams.get('customerId')
    const userId = searchParams.get('userId')
    const paymentMethod = searchParams.get('paymentMethod')
    const period = searchParams.get('period')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: any = { held: false }
    if (search) where.OR = [{ invoiceNumber: { contains: search } }]
    if (customerId) where.customerId = customerId
    if (userId) where.userId = userId
    if (paymentMethod) where.paymentMethod = paymentMethod

    const now = new Date()
    if (period === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      where.createdAt = { gte: start }
    } else if (period === 'week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      where.createdAt = { gte: start }
    } else if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      where.createdAt = { gte: start }
    } else if (dateFrom && dateTo) {
      where.createdAt = { gte: new Date(dateFrom), lte: new Date(dateTo) }
    }

    const sales = await db.sale.findMany({
      where,
      include: {
        customer: true, user: true, items: { include: { product: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' }
    })

    return successResponse(sales)
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})

// POST /api/sales - create new sale
export const POST = withAuth('sale.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    // SECURITY: userId from session, not body — prevents accountability spoofing
    const { items, customerId, discountAmount, discountType,
      paymentMethod, paymentDetails, paidAmount, note, loyaltyRedeem } = body
    const userId = user.id  // ← from authenticated session

    if (!items || items.length === 0) return errorResponse('لا توجد أصناف في الفاتورة')

    // IDEMPOTENCY: Use clientTxnId from header or generate new
    const clientTxnId = req.headers.get('X-Client-Txn-Id') || generateUUID()

    // Get warehouse
    const warehouse = await db.warehouse.findFirst()
    if (!warehouse) return errorResponse('لا يوجد مخزن', 500)

    // Validate stock & compute totals
    let subtotal = 0
    let taxAmount = 0
    const itemsData: any[] = []

    for (const item of items) {
      const product = await db.product.findUnique({
        where: { id: item.productId },
        include: { stockLevels: true }
      })
      if (!product) return errorResponse(`المنتج غير موجود`, 404)

      const currentStock = product.stockLevels
        ?.filter((s: any) => s.warehouseId === warehouse.id)
        .reduce((s: number, l: any) => s + l.quantity, 0) || 0

      if (!product.allowNegativeStock && currentStock < item.quantity) {
        return errorResponse(`المخزون غير كافي للمنتج: ${product.nameAr || product.name} (متاح: ${currentStock})`)
      }

      const lineTotal = product.sellingPrice * item.quantity
      const lineTax = lineTotal * (product.taxRate / 100)
      subtotal += lineTotal
      taxAmount += lineTax

      itemsData.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.sellingPrice,
        taxAmount: lineTax,
        total: lineTotal + lineTax,
        costAtSale: product.avgCost || product.purchaseCost,
      })
    }

    const discAmt = parseFloat(discountAmount) || 0
    const total = subtotal - discAmt + taxAmount
    const paid = parseFloat(paidAmount) || total

    // Loyalty calculation
    let loyaltyEarned = 0
    if (customerId && !loyaltyRedeem) {
      const setting = await db.setting.findUnique({ where: { key: 'loyalty.pointsPerEgp' } })
      const rate = setting ? parseFloat(setting.value) : 0.1
      loyaltyEarned = Math.floor(total * rate)
    }

    // Try RPC first, fall back to manual operations if RPC not available
    let saleId = clientTxnId
    let invoiceNumber = `INV-${Date.now()}`

    try {
      const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('create_sale_atomic', {
        p_client_txn_id: clientTxnId,
        p_user_id: userId,
        p_customer_id: customerId || '',
        p_warehouse_id: warehouse.id,
        p_items: itemsData,
        p_subtotal: subtotal,
        p_discount_amount: discAmt,
        p_tax_amount: taxAmount,
        p_total: total,
        p_paid_amount: paid,
        p_payment_method: paymentMethod || 'CASH',
        p_payment_details: JSON.stringify(paymentDetails || {}),
        p_loyalty_earned: loyaltyEarned,
        p_loyalty_redeemed: loyaltyRedeem || 0,
        p_note: note || '',
      })

      if (rpcError) {
        // RPC not available — use manual operations
        console.log('[Sales] RPC not available, using manual operations')
        const manualResult = await createSaleManual(clientTxnId, userId, customerId, warehouse.id, itemsData,
          subtotal, discAmt, taxAmount, total, paid, paymentMethod, loyaltyEarned, loyaltyRedeem || 0, note)
        saleId = manualResult.saleId
        invoiceNumber = manualResult.invoiceNumber
      } else if (rpcResult) {
        saleId = rpcResult.saleId || clientTxnId
        invoiceNumber = rpcResult.invoiceNumber || invoiceNumber
      }
    } catch (rpcErr) {
      // RPC failed — use manual operations
      console.log('[Sales] RPC failed, using manual operations:', rpcErr)
      const manualResult = await createSaleManual(clientTxnId, userId, customerId, warehouse.id, itemsData,
        subtotal, discAmt, taxAmount, total, paid, paymentMethod, loyaltyEarned, loyaltyRedeem || 0, note)
      saleId = manualResult.saleId
      invoiceNumber = manualResult.invoiceNumber
    }

    // Fetch the complete sale with relations for the receipt
    const sale = await db.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { include: { product: true } },
        customer: true,
        user: { select: { name: true } },
      },
    })

    return successResponse(sale, 'تم إنشاء الفاتورة بنجاح')
  } catch (e: unknown) {
    console.error('[Sales] Error:', e)
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})

// ============================================================
// MANUAL SALE CREATION — fallback when RPC is not available
// ============================================================
async function createSaleManual(
  clientTxnId: string,
  userId: string,
  customerId: string | undefined,
  warehouseId: string,
  items: any[],
  subtotal: number,
  discountAmount: number,
  taxAmount: number,
  total: number,
  paidAmount: number,
  paymentMethod: string,
  loyaltyEarned: number,
  loyaltyRedeemed: number,
  note?: string,
): Promise<{ saleId: string, invoiceNumber: string }> {
  const invoiceNumber = `INV-${Date.now()}`
  const saleId = clientTxnId
  const changeAmount = Math.max(0, paidAmount - total)

  // 1. Create sale
  await db.sale.create({
    data: {
      id: saleId,
      invoiceNumber,
      customerId: customerId || null,
      userId,
      subtotal,
      discountAmount,
      taxAmount,
      total,
      paidAmount,
      changeAmount,
      status: 'COMPLETED',
      paymentMethod,
      paymentDetails: '{}',
      loyaltyEarned,
      loyaltyRedeemed,
      note: note || null,
      clientTxnId,  // IDEMPOTENCY: store clientTxnId on sale
    }
  })

  // 2. Create sale items + deduct stock
  for (const item of items) {
    await db.saleItem.create({
      data: {
        id: randomUUID(),
        saleId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: 0,
        taxAmount: item.taxAmount,
        total: item.total,
        costAtSale: item.costAtSale,
      }
    })

    // Deduct stock (manual) — WITH OVERSELLING PREVENTION
    const stockLevel = await db.stockLevel.findFirst({
      where: { productId: item.productId, warehouseId }
    })
    if (stockLevel) {
      // CRITICAL FIX: check stock before deducting (was missing before)
      // This prevents overselling when RPC is not available
      if (stockLevel.quantity < item.quantity) {
        // Rollback: delete the sale we just created
        await db.sale.delete({ where: { id: saleId } }).catch(() => {})
        throw new Error(`المخزون غير كافي للمنتج (متاح: ${stockLevel.quantity}, مطلوب: ${item.quantity})`)
      }
      await db.stockLevel.update({
        where: { id: stockLevel.id },
        data: { quantity: stockLevel.quantity - item.quantity }
      })
    }

    // Stock movement
    await db.stockMovement.create({
      data: {
        id: randomUUID(),
        productId: item.productId,
        warehouseId,
        type: 'SALE',
        quantity: -item.quantity,
        refType: 'Sale',
        refId: saleId,
      }
    })
  }

  // 3. Create payment
  await db.salePayment.create({
    data: {
      id: randomUUID(),
      saleId,
      method: paymentMethod,
      amount: total,
    }
  })

  // 4. Loyalty
  if (customerId && loyaltyEarned > 0) {
    const acct = await db.loyaltyAccount.findUnique({ where: { customerId } })
    if (acct) {
      await db.loyaltyAccount.update({
        where: { customerId },
        data: {
          points: acct.points + loyaltyEarned,
          totalEarned: acct.totalEarned + loyaltyEarned,
        }
      })
    } else {
      await db.loyaltyAccount.create({
        data: {
          id: randomUUID(),
          customerId,
          points: loyaltyEarned,
          totalEarned: loyaltyEarned,
          tier: 'BRONZE',
        }
      })
    }
    await db.loyaltyTransaction.create({
      data: {
        id: randomUUID(),
        customerId,
        type: 'EARN',
        points: loyaltyEarned,
        refType: 'Sale',
        refId: saleId,
        note: `نقاط من ${invoiceNumber}`,
      }
    })
  }

  // 5. Cash movement
  if (paymentMethod === 'CASH') {
    const session = await db.cashSession.findFirst({ where: { status: 'OPEN' } })
    if (session) {
      await db.cashMovement.create({
        data: {
          id: randomUUID(),
          sessionId: session.id,
          type: 'SALE',
          amount: total,
          refType: 'Sale',
          refId: saleId,
          note: invoiceNumber,
        }
      })
    }
  }

  // 6. Audit log
  await db.auditLog.create({
    data: {
      id: randomUUID(),
      userId,
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: saleId,
      after: JSON.stringify({ invoiceNumber, total }),
    }
  })

  return { saleId, invoiceNumber }
}
