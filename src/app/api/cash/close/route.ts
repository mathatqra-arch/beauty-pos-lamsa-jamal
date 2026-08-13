import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/cash/close
export const POST = withAuth('cash.close', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    // SECURITY: userId from session, not body
    const { sessionId, actualCash } = body
    const userId = user.id

    if (!sessionId) return errorResponse('رقم الجلسة مطلوب')
    if (actualCash === undefined || actualCash === null) return errorResponse('النقد الفعلي مطلوب')

    const session = await db.cashSession.findUnique({
      where: { id: sessionId },
      include: { movements: true },
    })
    if (!session) return errorResponse('الجلسة غير موجودة', 404)
    if (session.status === 'CLOSED') return errorResponse('الجلسة مغلقة بالفعل', 400)

    // Calculate expected cash
    const expectedCash =
      session.openingBalance +
      session.movements.reduce((sum, m) => {
        if (m.type === 'CASH_IN' || m.type === 'SALE' || m.type === 'OPENING') return sum + m.amount
        if (m.type === 'CASH_OUT' || m.type === 'REFUND' || m.type === 'EXPENSE') return sum - m.amount
        return sum
      }, 0)

    const actual = parseFloat(actualCash) || 0
    const difference = actual - expectedCash

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closingBalance: actual,
          expectedCash,
          difference,
          closedAt: new Date(),
        },
      })

      // Create CLOSING movement
      await tx.cashMovement.create({
        data: {
          sessionId,
          type: 'CLOSING',
          amount: actual,
          note: `إغلاق الدرج - الفرق: ${difference.toFixed(2)}`,
        },
      })

      // Audit log — userId from session only
      await tx.auditLog.create({
        data: {
          userId,
          action: 'CASH_CLOSED',
          entity: 'CashSession',
          entityId: sessionId,
          before: JSON.stringify({ status: 'OPEN' }),
          after: JSON.stringify({
            status: 'CLOSED',
            expectedCash,
            actualCash: actual,
            difference,
          }),
        },
      })

      return updated
    })

    return successResponse(
      { ...result, expectedCash, actualCash: actual, difference },
      'تم إغلاق درج الكاش'
    )
  } catch (e: unknown) {
    console.error('[cash/close] error:', e)
    return errorResponse('فشل إغلاق درج الكاش', 500)
  }
})
