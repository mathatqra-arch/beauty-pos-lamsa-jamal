import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/categories/[id]
export const GET = withAuth('categories.view', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const category = await db.category.findUnique({ where: { id } })
    if (!category) return errorResponse('الفئة غير موجودة', 404)

    // Get children manually
    const children = await db.category.findMany({ where: { parentId: id } })
    // Get product count
    const products = await db.product.findMany({ where: { categoryId: id }, select: { id: true } })

    return successResponse({ ...category, children, products, productCount: products.length })
  } catch (e: unknown) {
    console.error('[categories/get] error:', e)
    return errorResponse('فشل تحميل الفئة', 500)
  }
})

// PUT /api/categories/[id] - update category
export const PUT = withAuth('categories.edit', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { name, nameAr, parentId, color, icon } = body

    const existing = await db.category.findUnique({ where: { id } })
    if (!existing) return errorResponse('الفئة غير موجودة', 404)
    if (!name) return errorResponse('اسم الفئة مطلوب')

    // Prevent self-parenting
    if (parentId === id) return errorResponse('لا يمكن تعيين الفئة كأب لنفسها', 400)

    if (parentId) {
      const parent = await db.category.findUnique({ where: { id: parentId } })
      if (!parent) return errorResponse('الفئة الأب غير موجودة', 404)
    }

    const category = await db.category.update({
      where: { id },
      data: {
        name,
        nameAr: nameAr || null,
        parentId: parentId || null,
        color: color || null,
        icon: icon || null,
      },
    })

    return successResponse(category, 'تم تحديث الفئة بنجاح')
  } catch (e: unknown) {
    console.error('[categories/update] error:', e)
    return errorResponse('فشل تحديث الفئة', 500)
  }
})

// DELETE /api/categories/[id]
export const DELETE = withAuth('categories.delete', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const existing = await db.category.findUnique({ where: { id } })
    if (!existing) return errorResponse('الفئة غير موجودة', 404)

    // Check children
    const children = await db.category.findMany({ where: { parentId: id } })
    if (children.length > 0) {
      return errorResponse('لا يمكن حذف فئة تحتوي على فئات فرعية. احذف الفئات الفرعية أولاً.', 409)
    }

    // Check products
    const products = await db.product.findMany({ where: { categoryId: id }, select: { id: true } })
    if (products.length > 0) {
      return errorResponse(`لا يمكن حذف الفئة لأنها مرتبطة بـ ${products.length} منتج.`, 409)
    }

    await db.category.delete({ where: { id } })
    return successResponse(null, 'تم حذف الفئة بنجاح')
  } catch (e: unknown) {
    console.error('[categories/delete] error:', e)
    return errorResponse('فشل حذف الفئة', 500)
  }
})
