import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/loyalty - list loyalty accounts with customer + tier info
export const GET = withAuth('loyalty.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const tier = searchParams.get('tier')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: any = {}
    if (tier) where.tier = tier

    const accounts = await db.loyaltyAccount.findMany({
      where,
      include: { customer: true },
      take: limit,
      orderBy: { points: 'desc' },
    })

    // Fetch tier definitions
    const tiers = await db.loyaltyTier.findMany()
    const tierMap = new Map(tiers.map((t) => [t.name, t]))

    const result = accounts.map((a) => ({
      ...a,
      tierInfo: tierMap.get(a.tier) || null,
    }))

    return successResponse(result)
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
