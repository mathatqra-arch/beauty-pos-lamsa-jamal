import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// GET /api/products - list with search, filter
export const GET = withAuth('products.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId')
    const barcode = searchParams.get('barcode')
    const limit = parseInt(searchParams.get('limit') || '200')

    // Barcode quick lookup
    if (barcode) {
      const products = await db.product.findMany({ take: 500 })
      const product = products.find((p: any) =>
        p.barcode === barcode ||
        (p.barcodes && JSON.parse(p.barcodes || '[]').includes(barcode))
      )
      if (!product) return successResponse(null, 'المنتج غير موجود')
      return successResponse({ ...product, currentStock: 0 })
    }

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameAr: { contains: search } },
        { sku: { contains: search } },
        { barcode: { contains: search } },
      ]
    }
    if (categoryId) where.categoryId = categoryId

    const products = await db.product.findMany({
      where,
      take: limit,
      orderBy: { name: 'asc' }
    })

    // Get stock levels separately
    const stockLevels = await db.stockLevel.findMany({ take: 2000 })
    const stockMap = new Map<string, number>()
    for (const sl of stockLevels) {
      stockMap.set(sl.productId, (stockMap.get(sl.productId) || 0) + (sl.quantity || 0))
    }

    const result = products.map((p: any) => ({
      ...p,
      currentStock: stockMap.get(p.id) || 0,
      stockLevels: [{ quantity: stockMap.get(p.id) || 0 }],
    }))

    return successResponse(result)
  } catch (e: unknown) {
    console.error('[products/list] error:', e)
    return errorResponse('فشل تحميل المنتجات', 500)
  }
})

// POST /api/products - create new product
export const POST = withAuth('products.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { name, nameAr, sku, barcode, categoryId, brandId, unitId, supplierId,
      purchaseCost, sellingPrice, wholesalePrice, taxRate, minStock, reorderLevel,
      openingStock, image, description, active } = body

    if (!name || !sku) return errorResponse('الاسم ورمز SKU مطلوبان')

    // Check unique SKU
    const existing = await db.product.findMany({ where: { sku }, take: 1 })
    if (existing.length > 0) return errorResponse('رمز SKU مستخدم بالفعل', 409)

    // Honor a client-supplied id (critical for offline-first sync: the
    // desktop app creates products locally with a generated id and later
    // pushes them here — if we mint a NEW id instead of using theirs, the
    // next pull-sync tries to insert a second row with the same sku under
    // a different id, which permanently fails with a UNIQUE constraint
    // error on every sync afterwards).
    const productId = body.id || randomUUID()

    const product = await db.product.create({
      data: {
        id: productId,
        name,
        nameAr: nameAr || null,
        sku,
        barcode: barcode || null,
        categoryId: categoryId || null,
        brandId: brandId || null,
        unitId: unitId || null,
        supplierId: supplierId || null,
        purchaseCost: parseFloat(purchaseCost) || 0,
        sellingPrice: parseFloat(sellingPrice) || 0,
        wholesalePrice: parseFloat(wholesalePrice) || 0,
        taxRate: parseFloat(taxRate) || 0,
        minStock: parseInt(minStock) || 0,
        reorderLevel: parseInt(reorderLevel) || 0,
        avgCost: parseFloat(purchaseCost) || 0,
        image: image || null,
        description: description || null,
        active: active !== false,
      },
    })

    // Create opening stock if provided
    if (openingStock && openingStock > 0) {
      const warehouse = await db.warehouse.findFirst()
      if (warehouse) {
        await db.stockLevel.create({
          data: {
            id: randomUUID(),
            productId,
            warehouseId: warehouse.id,
            quantity: parseInt(openingStock) || 0,
          }
        })
        await db.stockMovement.create({
          data: {
            id: randomUUID(),
            productId,
            warehouseId: warehouse.id,
            type: 'OPENING_STOCK',
            quantity: parseInt(openingStock) || 0,
            refType: 'Opening',
          }
        })
      }
    }

    return successResponse(product, 'تم إنشاء المنتج بنجاح')
  } catch (e: unknown) {
    console.error('[products/create] error:', e)
    return errorResponse('فشل إنشاء المنتج', 500)
  }
})
