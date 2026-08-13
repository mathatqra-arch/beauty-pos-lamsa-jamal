import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/analytics/products
export const GET = withAuth('analytics.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || 'month' // today|week|month|all
    const metric = searchParams.get('metric') || 'revenue' // revenue|profit|quantity
    const limit = parseInt(searchParams.get('limit') || '20')

    const now = new Date()
    let dateFrom: Date | null = null
    if (period === 'today') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === 'week') {
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1)
    }

    const saleItemWhere: any = { sale: { held: false } }
    if (dateFrom) saleItemWhere.sale.createdAt = { gte: dateFrom }

    const saleItems = await db.saleItem.findMany({
      where: saleItemWhere,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            sku: true,
            avgCost: true,
            stockLevels: { select: { quantity: true } },
          },
        },
      },
    })

    // Aggregate by product
    const map = new Map<
      string,
      {
        product: any
        units: number
        revenue: number
        cost: number
        lastSale: Date | null
      }
    >()

    for (const it of saleItems) {
      if (!it.product) continue
      const key = it.product.id
      if (!map.has(key)) {
        map.set(key, {
          product: it.product,
          units: 0,
          revenue: 0,
          cost: 0,
          lastSale: null,
        })
      }
      const entry = map.get(key)!
      entry.units += it.quantity
      entry.revenue += it.total
      entry.cost += it.costAtSale * it.quantity
      if (!entry.lastSale || it.saleId > entry.lastSale.toISOString()) {
        // we approximate using a hash of saleId; better: track via separate query below
      }
    }

    // Get last sale date for each product (using max createdAt of any sale containing product)
    const productIds = Array.from(map.keys())
    let lastSaleDates: { productId: string; lastSale: Date | null }[] = []
    if (productIds.length > 0) {
      const lastSales = await db.saleItem.findMany({
        where: { productId: { in: productIds } },
        select: { productId: true, sale: { select: { createdAt: true } } },
        orderBy: { sale: { createdAt: 'desc' } },
      })
      const lastMap = new Map<string, Date>()
      for (const ls of lastSales) {
        if (!lastMap.has(ls.productId)) lastMap.set(ls.productId, ls.sale.createdAt)
      }
      lastSaleDates = productIds.map((pid) => ({ productId: pid, lastSale: lastMap.get(pid) || null }))
    }
    const lastSaleMap = new Map(lastSaleDates.map((l) => [l.productId, l.lastSale]))

    const now2 = new Date()
    let result = Array.from(map.values()).map((entry) => {
      const grossProfit = entry.revenue - entry.cost
      const margin = entry.revenue > 0 ? (grossProfit / entry.revenue) * 100 : 0
      const currentStock = entry.product.stockLevels.reduce((s: number, l: any) => s + l.quantity, 0)
      const lastSale = lastSaleMap.get(entry.product.id) || null
      const daysSinceLastSale = lastSale
        ? Math.floor((now2.getTime() - lastSale.getTime()) / (24 * 60 * 60 * 1000))
        : null
      const { stockLevels, ...productInfo } = entry.product
      return {
        product: productInfo,
        unitsSold: entry.units,
        revenue: entry.revenue,
        cost: entry.cost,
        grossProfit,
        marginPercent: parseFloat(margin.toFixed(2)),
        currentStock,
        lastSale,
        daysSinceLastSale,
      }
    })

    // Sort by chosen metric
    if (metric === 'revenue') {
      result.sort((a, b) => b.revenue - a.revenue)
    } else if (metric === 'profit') {
      result.sort((a, b) => b.grossProfit - a.grossProfit)
    } else if (metric === 'quantity') {
      result.sort((a, b) => b.unitsSold - a.unitsSold)
    }

    const top = result.slice(0, limit)
    const worst = [...result].reverse().slice(0, limit)

    // Summary
    const summary = {
      totalProductsSold: result.length,
      totalUnitsSold: result.reduce((s, r) => s + r.unitsSold, 0),
      totalRevenue: result.reduce((s, r) => s + r.revenue, 0),
      totalCost: result.reduce((s, r) => s + r.cost, 0),
      totalGrossProfit: result.reduce((s, r) => s + r.grossProfit, 0),
      averageMargin: result.length > 0
        ? parseFloat((result.reduce((s, r) => s + r.marginPercent, 0) / result.length).toFixed(2))
        : 0,
    }

    return successResponse({
      period,
      metric,
      summary,
      bestSellers: top,
      worstSellers: worst,
    })
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
