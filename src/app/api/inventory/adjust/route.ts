import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db, supabaseClient } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// POST /api/inventory/adjust — adjust stock atomically
// Uses adjust_inventory_atomic RPC which does INSERT ... ON CONFLICT
// to handle the upsert race condition. Falls back to manual if RPC unavailable.
export const POST = withAuth('inventory.adjust', async (req: NextRequest, user: SessionUser) => {
  const userId = user.id

  try {
    const body = await req.json()
    const { productId, warehouseId, newQuantity, reason, note } = body

    if (!productId) return errorResponse('المنتج مطلوب')
    if (!warehouseId) return errorResponse('المخزن مطلوب')
    if (newQuantity === undefined || newQuantity === null)
      return errorResponse('الكمية الجديدة مطلوبة')
    if (!reason) return errorResponse('سبب التعديل مطلوب')

    const newQty = parseInt(newQuantity) || 0
    const clientTxnId = req.headers.get('X-Client-Txn-Id') || randomUUID()

    // Try atomic RPC first
    let rpcResult: any = null
    let rpcError: any = null
    try {
      const resp = await supabaseClient.rpc('adjust_inventory_atomic', {
        p_client_txn_id: clientTxnId,
        p_product_id: productId,
        p_warehouse_id: warehouseId,
        p_new_quantity: newQty,
        p_reason: reason,
        p_note: note || null,
        p_user_id: userId,
      })
      rpcResult = resp.data
      rpcError = resp.error
    } catch (e: unknown) {
      rpcError = e
    }

    // RPC succeeded
    if (!rpcError && rpcResult && rpcResult.success) {
      if (rpcResult.idempotent) {
        return successResponse({ idempotent: true }, 'تم تعديل المخزون (idempotent)')
      }

      // Fetch the updated stock level + adjustment
      const stockLevel = await db.stockLevel.findFirst({
        where: { productId, warehouseId }
      })

      const adjustment = await db.stockAdjustment.findUnique({
        where: { id: rpcResult.adjustmentId },
      })

      // Audit log (non-blocking)
      await db.auditLog.create({
        data: {
          id: randomUUID(),
          userId,
          action: 'STOCK_ADJUSTMENT',
          entity: 'StockLevel',
          entityId: rpcResult.stockId,
          before: JSON.stringify({ quantity: rpcResult.oldQuantity }),
          after: JSON.stringify({ quantity: rpcResult.newQuantity }),
        },
      }).catch(() => {})

      return successResponse({ stockLevel, adjustment }, 'تم تعديل المخزون بنجاح')
    }

    // RPC had a technical error — use manual fallback
    if (rpcError) {
      console.warn('[inventory/adjust] RPC error, using manual fallback:', rpcError.message || rpcError)
    }

    // Manual fallback — check-then-upsert (less atomic but works)
    // Get current stock level
    const existing = await db.stockLevel.findFirst({
      where: { productId, warehouseId }
    })

    const oldQuantity = existing?.quantity || 0
    const diff = newQty - oldQuantity

    // Upsert stock level
    let stockLevel: any
    if (existing) {
      stockLevel = await db.stockLevel.update({
        where: { id: existing.id },
        data: { quantity: newQty }
      })
    } else {
      stockLevel = await db.stockLevel.create({
        data: { id: randomUUID(), productId, warehouseId, quantity: newQty }
      })
    }

    // Create adjustment record
    const adjustment = await db.stockAdjustment.create({
      data: {
        id: randomUUID(),
        productId,
        warehouseId,
        oldQuantity,
        newQuantity: newQty,
        reason,
        note: note || null,
        userId,
        clientTxnId,
      },
    })

    // Create stock movement
    await db.stockMovement.create({
      data: {
        id: randomUUID(),
        productId,
        warehouseId,
        type: 'ADJUSTMENT',
        quantity: diff,
        refType: 'StockAdjustment',
        refId: adjustment.id,
        note: note || reason,
        userId,
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'STOCK_ADJUSTMENT',
        entity: 'StockLevel',
        entityId: stockLevel.id,
        before: JSON.stringify({ quantity: oldQuantity }),
        after: JSON.stringify({ quantity: newQty }),
      },
    }).catch(() => {})

    return successResponse({ stockLevel, adjustment }, 'تم تعديل المخزون بنجاح')
  } catch (e: unknown) {
    console.error('[inventory/adjust] error:', e)
    return errorResponse('فشل تعديل المخزون', 500)
  }
})
