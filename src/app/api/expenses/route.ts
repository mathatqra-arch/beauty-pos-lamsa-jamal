import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/expenses
export const GET = withAuth('expense.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const categoryId = searchParams.get('categoryId')
    const paymentMethod = searchParams.get('paymentMethod')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: any = {}
    if (categoryId) where.categoryId = categoryId
    if (paymentMethod) where.paymentMethod = paymentMethod
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom)
      if (dateTo) where.date.lte = new Date(dateTo)
    }

    const expenses = await db.expense.findMany({
      where,
      include: {
        category: true,
        user: { select: { id: true, name: true, username: true } },
      },
      take: limit,
      orderBy: { date: 'desc' },
    })

    const total = expenses.reduce((s, e) => s + e.amount, 0)

    return successResponse({ expenses, total })
  } catch (e: unknown) {
    console.error('[expenses/list] error:', e)
    return errorResponse('فشل تحميل المصروفات', 500)
  }
})

// POST /api/expenses - create new expense
export const POST = withAuth('expense.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    // SECURITY: userId from session, not body
    const { categoryId, amount, paymentMethod, note, date } = body
    const userId = user.id

    if (!categoryId) return errorResponse('فئة المصروف مطلوبة')
    if (!amount || amount <= 0) return errorResponse('المبلغ يجب أن يكون أكبر من صفر')

    const category = await db.expenseCategory.findUnique({ where: { id: categoryId } })
    if (!category) return errorResponse('فئة المصروف غير موجودة', 404)

    const method = paymentMethod || 'CASH'
    const expenseDate = date ? new Date(date) : new Date()

    const expense = await db.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: {
          categoryId,
          userId,
          amount: parseFloat(amount),
          paymentMethod: method,
          note: note || null,
          date: expenseDate,
        },
        include: { category: true, user: { select: { id: true, name: true } } },
      })

      // If CASH, add cash movement to open session
      if (method === 'CASH') {
        const openSession = await tx.cashSession.findFirst({ where: { status: 'OPEN' } })
        if (openSession) {
          await tx.cashMovement.create({
            data: {
              sessionId: openSession.id,
              type: 'EXPENSE',
              amount: parseFloat(amount),
              note: note || `مصروف: ${category.name}`,
              refType: 'Expense',
              refId: newExpense.id,
            },
          })
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'EXPENSE_CREATED',
          entity: 'Expense',
          entityId: newExpense.id,
          after: JSON.stringify({ amount, categoryId, method }),
        },
      })

      return newExpense
    })

    return successResponse(expense, 'تم إنشاء المصروف')
  } catch (e: unknown) {
    console.error('[expenses/create] error:', e)
    return errorResponse('فشل إنشاء المصروف', 500)
  }
})
