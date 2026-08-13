import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/loyalty/[customerId] - customer loyalty account + transactions
export const GET = withAuth('loyalty.view', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { customerId  } = await ctx.params

    const account = await db.loyaltyAccount.findUnique({
      where: { customerId },
      include: { customer: true },
    })
    if (!account) return errorResponse('حساب الولاء غير موجود', 404)

    const transactions = await db.loyaltyTransaction.findMany({
      where: { customerId },
      take: 50,
      orderBy: { createdAt: 'desc' },
    })

    const tier = await db.loyaltyTier.findFirst({ where: { name: account.tier } })

    return successResponse({
      ...account,
      tierInfo: tier,
      transactions,
    })
  } catch (e: unknown) {
    console.error('[loyalty/get] error:', e)
    return errorResponse('فشل تحميل حساب الولاء', 500)
  }
})
