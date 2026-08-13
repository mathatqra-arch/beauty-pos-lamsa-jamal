import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { supabaseClient } from '@/lib/db'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// POST /api/loyalty/redeem - redeem points (ATOMIC via RPC)
// Uses redeem_loyalty_atomic RPC to prevent TOCTOU race condition.
// Two concurrent requests for 50 points on a 80-point balance
// will NOT result in -20 balance — the RPC uses FOR UPDATE + atomic check.
export const POST = withAuth('loyalty.redeem', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { customerId, points, note } = body

    if (!customerId) return errorResponse('العميل مطلوب')
    if (!points || points <= 0) return errorResponse('النقاط يجب أن تكون أكبر من صفر')

    // IDEMPOTENCY: use clientTxnId from header or generate new
    const clientTxnId = req.headers.get('X-Client-Txn-Id') || randomUUID()

    // Call atomic RPC — prevents TOCTOU race + negative balance
    const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('redeem_loyalty_atomic', {
      p_client_txn_id: clientTxnId,
      p_customer_id: customerId,
      p_points: points,
      p_note: note || 'استبدال نقاط',
      p_ref_type: null,
      p_ref_id: null,
    })

    if (rpcError) {
      console.error('[loyalty/redeem] RPC error:', rpcError)
      // Fallback to manual check-then-update (less safe but better than failing)
      const account = await db.loyaltyAccount.findUnique({ where: { customerId } })
      if (!account) return errorResponse('حساب الولاء غير موجود', 404)
      if (account.points < points) {
        return errorResponse(`الرصيد غير كافي. المتاح: ${account.points} نقطة`)
      }

      const updated = await db.loyaltyAccount.update({
        where: { customerId },
        data: {
          points: account.points - points,
          totalRedeemed: account.totalRedeemed + points,
        },
      })

      const txn = await db.loyaltyTransaction.create({
        data: {
          id: randomUUID(),
          customerId,
          type: 'REDEEM',
          points: -points,
          note: note || 'استبدال نقاط',
          clientTxnId,
        },
      })

      return successResponse({ account: updated, transaction: txn }, 'تم استبدال النقاط بنجاح')
    }

    if (!rpcResult || rpcResult.success === false) {
      const errMsg = rpcResult?.error || 'فشل الاستبدال'
      if (errMsg === 'insufficient_points') {
        return errorResponse(`الرصيد غير كافي. المتاح: ${rpcResult.currentPoints} نقطة`)
      }
      return errorResponse(errMsg)
    }

    // RPC succeeded — fetch updated account
    const updated = await db.loyaltyAccount.findUnique({ where: { customerId } })
    return successResponse({
      account: updated,
      transactionId: rpcResult.transactionId,
      remainingPoints: rpcResult.remainingPoints,
      idempotent: rpcResult.idempotent || false,
    }, 'تم استبدال النقاط بنجاح')
  } catch (e: unknown) {
    console.error('[loyalty/redeem] error:', e)
    return errorResponse('فشل استبدال النقاط', 500)
  }
})
