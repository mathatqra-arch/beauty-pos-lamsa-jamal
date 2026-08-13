import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// GET /api/categories - list all categories with hierarchy
export const GET = withAuth('categories.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const rootOnly = searchParams.get('rootOnly') === 'true'

    const categories = await db.category.findMany({
      orderBy: { name: 'asc' },
    })

    // Build hierarchy
    const allCats = categories.map((c: any) => ({ ...c, children: [], productCount: 0 }))
    const catMap = new Map<string, any>(allCats.map((c: any): [string, any] => [c.id, c]))

    for (const c of allCats) {
      if (c.parentId && catMap.has(c.parentId)) {
        catMap.get(c.parentId).children.push(c)
      }
    }

    // Product counts
    const products = await db.product.findMany({ take: 1000, select: { categoryId: true } })
    for (const c of allCats) {
      c.productCount = products.filter((p: any) => p.categoryId === c.id).length
    }

    const result = rootOnly ? allCats.filter((c: any) => !c.parentId) : allCats
    return successResponse(result)
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})

// POST /api/categories - create new category
export const POST = withAuth('categories.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { name, nameAr, parentId, color, icon } = body

    if (!name) return errorResponse('الاسم مطلوب')

    const category = await db.category.create({
      data: {
        id: randomUUID(),
        name,
        nameAr: nameAr || null,
        parentId: parentId || null,
        color: color || null,
        icon: icon || null,
      },
    })

    return successResponse(category, 'تم إنشاء الفئة بنجاح')
  } catch (e: unknown) {
    console.error('[categories/create] error:', e)
    return errorResponse('فشل إنشاء الفئة', 500)
  }
})
