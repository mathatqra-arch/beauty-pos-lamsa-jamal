import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/cash - get current open cash session with movements
export const GET = withAuth('cash.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    let session
    if (sessionId) {
      session = await db.cashSession.findUnique({
        where: { id: sessionId },
        include: {
          user: { select: { id: true, name: true, username: true } },
          register: true,
          movements: { orderBy: { createdAt: 'desc' } },
        },
      })
    } else {
      // Get current open session
      session = await db.cashSession.findFirst({
        where: { status: 'OPEN' },
        include: {
          user: { select: { id: true, name: true, username: true } },
          register: true,
          movements: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { openedAt: 'desc' },
      })
    }

    if (!session) {
      return successResponse(null, 'لا توجد جلسة كاش مفتوحة')
    }

    // Compute current expected cash
    const expectedCash =
      session.openingBalance +
      session.movements.reduce((sum, m) => {
        if (m.type === 'CASH_IN' || m.type === 'SALE' || m.type === 'OPENING') return sum + m.amount
        if (m.type === 'CASH_OUT' || m.type === 'REFUND' || m.type === 'EXPENSE') return sum - m.amount
        return sum
      }, 0)

    return successResponse({ ...session, expectedCash })
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
