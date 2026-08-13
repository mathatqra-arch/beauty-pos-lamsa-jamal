import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/expenses/categories - list expense categories
export const GET = withAuth('expense.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const [categories, expenses] = await Promise.all([
      db.expenseCategory.findMany({ orderBy: { name: 'asc' } }),
      db.expense.findMany({ take: 10000 }),
    ])

    // Count expenses per category manually (replaces Prisma _count)
    const expenseCountMap = new Map<string, number>()
    for (const e of expenses) {
      expenseCountMap.set(e.categoryId, (expenseCountMap.get(e.categoryId) || 0) + 1)
    }

    const result = categories.map((c) => ({
      ...c,
      expenseCount: expenseCountMap.get(c.id) || 0,
    }))

    return successResponse(result)
  } catch (e: unknown) {
    console.error('[expenses/categories/list] error:', e)
    return errorResponse('فشل تحميل فئات المصروفات', 500)
  }
})

// POST /api/expenses/categories - create new expense category
export const POST = withAuth('expense.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { name, nameAr, color } = body

    if (!name) return errorResponse('اسم الفئة مطلوب')

    const category = await db.expenseCategory.create({
      data: {
        name,
        nameAr: nameAr || null,
        color: color || null,
      },
    })

    return successResponse(category, 'تم إنشاء فئة المصروف')
  } catch (e: unknown) {
    console.error('[expenses/categories/create] error:', e)
    return errorResponse('فشل إنشاء فئة المصروف', 500)
  }
})
