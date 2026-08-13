import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// POST /api/cash/open — opens a cash register session
// Uses manual creation with pre-check + UNIQUE index protection.
// The partial UNIQUE index "CashSession_userId_OPEN_unique" prevents
// double-open at the database level.
export const POST = withAuth('cash.open', async (req: NextRequest, user: SessionUser) => {
  const userId = user.id

  try {
    const body = await req.json().catch(() => ({}))
    const { registerId, openingBalance } = body
    const opening = parseFloat(openingBalance) || 0
    const clientTxnId = req.headers.get('X-Client-Txn-Id') || randomUUID()

    // Resolve register — auto-create if none exists
    let regId: string | undefined = registerId
    if (!regId) {
      const register = await db.register.findFirst({ where: { active: true } })
      if (!register) {
        // Auto-create a default register + store if none exists
        try {
          let store = await db.store.findFirst()
          if (!store) {
            store = await db.store.create({
              data: {
                id: randomUUID(),
                name: 'المتجر الرئيسي',
                currency: 'EGP',
              },
            })
          }
          const newRegister = await db.register.create({
            data: {
              id: randomUUID(),
              name: 'الكاشير الرئيسي',
              storeId: store.id,
              active: true,
            },
          })
          regId = newRegister.id
        } catch (e: unknown) {
          console.error('[cash/open] Failed to auto-create register:', e)
          return errorResponse('فشل إنشاء درج نقدية تلقائي', 500)
        }
      } else {
        regId = register.id
      }
    } else {
      const r = await db.register.findUnique({ where: { id: regId } })
      if (!r) return errorResponse('الدرج غير موجود', 404)
    }

    // Check for existing OPEN session for this user (fast-path rejection)
    const existingOpen = await db.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
    })
    if (existingOpen) {
      return errorResponse('يوجد جلسة كاش مفتوحة بالفعل لهذا المستخدم', 409)
    }

    // Create session + opening movement manually
    // The partial UNIQUE index on CashSession(userId) WHERE status='OPEN'
    // provides database-level protection against double-open race.
    // NOTE: CashSession does not have clientTxnId column — idempotency
    // is handled by the pre-check + UNIQUE index, not by clientTxnId.
    const newSession = await db.cashSession.create({
      data: {
        id: randomUUID(),
        registerId: regId,
        userId,
        openingBalance: opening,
        status: 'OPEN',
      },
      include: {
        user: { select: { id: true, name: true, username: true } },
        register: true,
      },
    })

    // Create OPENING movement (non-blocking — don't fail if this fails)
    await db.cashMovement.create({
      data: {
        id: randomUUID(),
        sessionId: newSession.id,
        type: 'OPENING',
        amount: opening,
        note: 'رصيد افتتاحي',
        clientTxnId: clientTxnId + '-opening',
      },
    }).catch((e: any) => {
      console.error('[cash/open] Failed to create OPENING movement:', e)
    })

    // Audit log (non-blocking)
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'CASH_OPENED',
        entity: 'CashSession',
        entityId: newSession.id,
        after: JSON.stringify({ openingBalance: opening }),
      },
    }).catch(() => {})

    return successResponse(newSession, 'تم فتح درج الكاش')
  } catch (e: unknown) {
    // Check for UNIQUE constraint violation (double-open race)
    const errMsg = e instanceof Error ? e.message : String(e)
    if (errMsg.includes('CashSession_userId_OPEN_unique') || errMsg.includes('duplicate key') || errMsg.includes('unique')) {
      return errorResponse('يوجد جلسة كاش مفتوحة بالفعل لهذا المستخدم', 409)
    }
    console.error('[cash/open] error:', e)
    return errorResponse('فشل فتح درج الكاش: ' + errMsg.substring(0, 200), 500)
  }
})
