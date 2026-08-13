import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/inventory - list products with stock levels, stock value, filters
export const GET = withAuth('inventory.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const filter = searchParams.get('filter') // lowStock | outOfStock
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId')
    const warehouseId = searchParams.get('warehouseId')
    const limit = parseInt(searchParams.get('limit') || '500')

    const where: any = { trackStock: true }
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
      include: {
        category: true,
        stockLevels: warehouseId
          ? { where: { warehouseId }, include: { warehouse: true } }
          : { include: { warehouse: true } },
      },
      take: limit,
      orderBy: { name: 'asc' },
    })

    // Aggregate stock movements summary per product
    const productIds = products.map((p) => p.id)
    const movements = await db.stockMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantity: true },
      _count: true,
    })
    const movementMap = new Map<string, any>(movements.map((m): [string, any] => [m.productId, m]))

    let result = products.map((p) => {
      const totalStock = p.stockLevels.reduce((s, l) => s + l.quantity, 0)
      const stockValue = totalStock * p.avgCost
      const mvm = movementMap.get(p.id)
      return {
        ...p,
        currentStock: totalStock,
        stockValue,
        isLowStock: totalStock <= p.reorderLevel && totalStock > 0,
        isOutOfStock: totalStock <= 0,
        movementsSummary: mvm
          ? { totalQuantity: mvm._sum.quantity || 0, totalCount: mvm._count }
          : { totalQuantity: 0, totalCount: 0 },
      }
    })

    if (filter === 'lowStock') {
      result = result.filter((p) => p.isLowStock)
    } else if (filter === 'outOfStock') {
      result = result.filter((p) => p.isOutOfStock)
    }

    const summary = {
      totalProducts: result.length,
      totalStockValue: result.reduce((s, p) => s + p.stockValue, 0),
      totalUnits: result.reduce((s, p) => s + p.currentStock, 0),
      lowStockCount: result.filter((p) => p.isLowStock).length,
      outOfStockCount: result.filter((p) => p.isOutOfStock).length,
    }

    return successResponse({ products: result, summary })
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
