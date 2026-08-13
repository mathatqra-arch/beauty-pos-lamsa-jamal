import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/products/[id]
export const GET = withAuth('products.view', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true, brand: true, unit: true, supplier: true,
        stockLevels: { include: { warehouse: true } },
        stockMovements: { take: 20, orderBy: { createdAt: 'desc' } },
      }
    })
    if (!product) return errorResponse('المنتج غير موجود', 404)
    return successResponse({
      ...product,
      currentStock: product.stockLevels.reduce((s, l) => s + l.quantity, 0),
    })
  } catch (e: unknown) {
    console.error('[products/get] error:', e)
    return errorResponse('فشل تحميل المنتج', 500)
  }
})

// PUT /api/products/[id] - update product
export const PUT = withAuth('products.edit', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { name, nameAr, sku, barcode, categoryId, brandId, unitId, supplierId,
      purchaseCost, sellingPrice, wholesalePrice, taxRate, minStock, reorderLevel,
      image, description, active } = body

    if (sku) {
      const exists = await db.product.findFirst({ where: { sku, NOT: { id } } })
      if (exists) return errorResponse('رمز SKU مستخدم بالفعل', 409)
    }

    const product = await db.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(sku !== undefined && { sku }),
        ...(barcode !== undefined && { barcode }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(brandId !== undefined && { brandId: brandId || null }),
        ...(unitId !== undefined && { unitId: unitId || null }),
        ...(supplierId !== undefined && { supplierId: supplierId || null }),
        ...(purchaseCost !== undefined && { purchaseCost: parseFloat(purchaseCost) }),
        ...(sellingPrice !== undefined && { sellingPrice: parseFloat(sellingPrice) }),
        ...(wholesalePrice !== undefined && { wholesalePrice: parseFloat(wholesalePrice) }),
        ...(taxRate !== undefined && { taxRate: parseFloat(taxRate) }),
        ...(minStock !== undefined && { minStock: parseInt(minStock) }),
        ...(reorderLevel !== undefined && { reorderLevel: parseInt(reorderLevel) }),
        ...(image !== undefined && { image }),
        ...(description !== undefined && { description }),
        ...(active !== undefined && { active }),
      }
    })

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'PRODUCT_UPDATED',
        entity: 'Product',
        entityId: id,
        after: JSON.stringify({ name, sku, sellingPrice }),
      }
    })

    return successResponse(product, 'تم تحديث المنتج')
  } catch (e: unknown) {
    console.error('[products/update] error:', e)
    return errorResponse('فشل تحديث المنتج', 500)
  }
})

// DELETE /api/products/[id] - soft delete (deactivate)
export const DELETE = withAuth('products.delete', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const product = await db.product.update({
      where: { id }, data: { active: false }
    })

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'PRODUCT_ARCHIVED',
        entity: 'Product',
        entityId: id,
      }
    })

    return successResponse(product, 'تم أرشفة المنتج')
  } catch (e: unknown) {
    console.error('[products/delete] error:', e)
    return errorResponse('فشل أرشفة المنتج', 500)
  }
})
