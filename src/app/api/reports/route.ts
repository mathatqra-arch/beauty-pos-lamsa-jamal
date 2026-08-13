import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/reports?type=sales|profit|inventory|product|customer|supplier|cash|expense|loyalty|tax
export const GET = withAuth('reports.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'sales'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const groupBy = searchParams.get('groupBy') // day|week|month|category|product|customer

    const dateWhere: any = {}
    if (dateFrom) dateWhere.gte = new Date(dateFrom)
    if (dateTo) dateWhere.lte = new Date(dateTo)

    const hasDate = dateFrom || dateTo

    switch (type) {
      case 'sales': {
        const where: any = { held: false }
        if (hasDate) where.createdAt = dateWhere
        const sales = await db.sale.findMany({
          where,
          include: {
            customer: { select: { id: true, name: true } },
            user: { select: { id: true, name: true } },
            items: { include: { product: { select: { id: true, name: true, nameAr: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        })

        const summary = {
          count: sales.length,
          totalSubtotal: sales.reduce((s, x) => s + x.subtotal, 0),
          totalDiscount: sales.reduce((s, x) => s + x.discountAmount, 0),
          totalTax: sales.reduce((s, x) => s + x.taxAmount, 0),
          total: sales.reduce((s, x) => s + x.total, 0),
          totalPaid: sales.reduce((s, x) => s + x.paidAmount, 0),
        }

        // Group by if requested
        let grouped: any[] | null = null
        if (groupBy === 'day' || groupBy === 'month' || groupBy === 'week') {
          const map = new Map<string, { count: number; total: number }>()
          for (const s of sales) {
            const d = s.createdAt
            let key: string
            if (groupBy === 'day') {
              key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            } else if (groupBy === 'month') {
              key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            } else {
              const week = Math.floor(d.getDate() / 7) + 1
              key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-W${week}`
            }
            if (!map.has(key)) map.set(key, { count: 0, total: 0 })
            const entry = map.get(key)!
            entry.count++
            entry.total += s.total
          }
          grouped = Array.from(map.entries()).map(([key, v]) => ({ key, ...v }))
        }

        return successResponse({ summary, sales, grouped })
      }

      case 'profit': {
        const where: any = { sale: { held: false } }
        if (hasDate) where.sale.createdAt = dateWhere
        const items = await db.saleItem.findMany({
          where,
          include: { product: { select: { id: true, name: true, nameAr: true, sku: true } } },
        })
        const revenue = items.reduce((s, it) => s + it.total, 0)
        const cost = items.reduce((s, it) => s + it.costAtSale * it.quantity, 0)
        const grossProfit = revenue - cost
        const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

        // Group by product
        let byProduct: any[] | null = null
        if (groupBy === 'product') {
          const map = new Map<string, { name: string; nameAr: string | null; sku: string; units: number; revenue: number; cost: number; profit: number }>()
          for (const it of items) {
            const p = it.product
            if (!p) continue
            if (!map.has(p.id)) {
              map.set(p.id, { name: p.name, nameAr: p.nameAr, sku: p.sku, units: 0, revenue: 0, cost: 0, profit: 0 })
            }
            const e = map.get(p.id)!
            e.units += it.quantity
            e.revenue += it.total
            e.cost += it.costAtSale * it.quantity
            e.profit = e.revenue - e.cost
          }
          byProduct = Array.from(map.values()).sort((a, b) => b.profit - a.profit)
        }

        return successResponse({
          summary: {
            revenue,
            cost,
            grossProfit,
            marginPercent: parseFloat(margin.toFixed(2)),
            itemCount: items.length,
          },
          items,
          byProduct,
        })
      }

      case 'inventory': {
        const products = await db.product.findMany({
          where: { trackStock: true },
          include: {
            category: { select: { id: true, name: true } },
            stockLevels: { select: { quantity: true, warehouseId: true } },
          },
        })
        const rows = products.map((p) => {
          const stock = p.stockLevels.reduce((s, l) => s + l.quantity, 0)
          return {
            id: p.id,
            name: p.name,
            nameAr: p.nameAr,
            sku: p.sku,
            category: p.category,
            stock,
            avgCost: p.avgCost,
            stockValue: stock * p.avgCost,
            sellingPrice: p.sellingPrice,
            potentialRevenue: stock * p.sellingPrice,
            reorderLevel: p.reorderLevel,
            status: stock <= 0 ? 'OUT_OF_STOCK' : stock <= p.reorderLevel ? 'LOW_STOCK' : 'IN_STOCK',
          }
        })
        const summary = {
          totalProducts: rows.length,
          totalUnits: rows.reduce((s, r) => s + r.stock, 0),
          totalStockValue: rows.reduce((s, r) => s + r.stockValue, 0),
          totalPotentialRevenue: rows.reduce((s, r) => s + r.potentialRevenue, 0),
          outOfStock: rows.filter((r) => r.status === 'OUT_OF_STOCK').length,
          lowStock: rows.filter((r) => r.status === 'LOW_STOCK').length,
        }
        return successResponse({ summary, products: rows })
      }

      case 'product': {
        const where: any = { sale: { held: false } }
        if (hasDate) where.sale.createdAt = dateWhere
        const items = await db.saleItem.findMany({
          where,
          include: { product: { select: { id: true, name: true, nameAr: true, sku: true } } },
        })
        const map = new Map<string, { product: any; units: number; revenue: number; cost: number; profit: number }>()
        for (const it of items) {
          if (!it.product) continue
          const key = it.product.id
          if (!map.has(key)) map.set(key, { product: it.product, units: 0, revenue: 0, cost: 0, profit: 0 })
          const e = map.get(key)!
          e.units += it.quantity
          e.revenue += it.total
          e.cost += it.costAtSale * it.quantity
          e.profit = e.revenue - e.cost
        }
        const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
        const summary = {
          productCount: rows.length,
          totalUnits: rows.reduce((s, r) => s + r.units, 0),
          totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
          totalProfit: rows.reduce((s, r) => s + r.profit, 0),
        }
        return successResponse({ summary, products: rows })
      }

      case 'customer':
      case 'customers': {
        const where: any = { held: false }
        if (hasDate) where.createdAt = dateWhere
        const sales = await db.sale.findMany({
          where,
          include: { customer: { select: { id: true, name: true, phone: true, tier: true } } },
        })
        const map = new Map<string, { customer: any; orders: number; total: number }>()
        for (const s of sales) {
          if (!s.customer) continue
          const key = s.customer.id
          if (!map.has(key)) map.set(key, { customer: s.customer, orders: 0, total: 0 })
          const e = map.get(key)!
          e.orders++
          e.total += s.total
        }
        const rows = Array.from(map.values()).sort((a, b) => b.total - a.total)
        const summary = {
          customerCount: rows.length,
          totalOrders: rows.reduce((s, r) => s + r.orders, 0),
          totalRevenue: rows.reduce((s, r) => s + r.total, 0),
          avgOrderValue: rows.length > 0 ? rows.reduce((s, r) => s + r.total, 0) / rows.reduce((s, r) => s + r.orders, 0) : 0,
        }
        return successResponse({ summary, customers: rows })
      }

      case 'supplier':
      case 'suppliers': {
        const where: any = {}
        if (hasDate) where.createdAt = dateWhere
        const purchases = await db.purchase.findMany({
          where,
          include: {
            supplier: { select: { id: true, name: true, phone: true, balance: true } },
            items: true,
          },
        })
        const map = new Map<string, { supplier: any; purchases: number; total: number; paid: number; balance: number }>()
        for (const p of purchases) {
          const key = p.supplier.id
          if (!map.has(key)) {
            map.set(key, {
              supplier: p.supplier,
              purchases: 0,
              total: 0,
              paid: 0,
              balance: 0,
            })
          }
          const e = map.get(key)!
          e.purchases++
          e.total += p.total
          e.paid += p.paidAmount
          e.balance += p.total - p.paidAmount
        }
        const rows = Array.from(map.values()).sort((a, b) => b.total - a.total)
        const summary = {
          supplierCount: rows.length,
          totalPurchases: rows.reduce((s, r) => s + r.total, 0),
          totalPaid: rows.reduce((s, r) => s + r.paid, 0),
          totalBalance: rows.reduce((s, r) => s + r.balance, 0),
        }
        return successResponse({ summary, suppliers: rows })
      }

      case 'cash': {
        const where: any = {}
        if (hasDate) where.openedAt = dateWhere
        const sessions = await db.cashSession.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, username: true } },
            register: true,
            movements: true,
          },
          orderBy: { openedAt: 'desc' },
        })
        const rows = sessions.map((s) => ({
          id: s.id,
          user: s.user,
          register: s.register,
          openingBalance: s.openingBalance,
          closingBalance: s.closingBalance,
          expectedCash: s.expectedCash,
          difference: s.difference,
          status: s.status,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          movementCount: s.movements.length,
          totalIn: s.movements.filter((m) => ['CASH_IN', 'SALE', 'OPENING'].includes(m.type)).reduce((sum, m) => sum + m.amount, 0),
          totalOut: s.movements.filter((m) => ['CASH_OUT', 'REFUND', 'EXPENSE'].includes(m.type)).reduce((sum, m) => sum + m.amount, 0),
        }))
        const summary = {
          sessionCount: rows.length,
          totalOpening: rows.reduce((s, r) => s + r.openingBalance, 0),
          totalClosing: rows.reduce((s, r) => s + (r.closingBalance || 0), 0),
          totalDifference: rows.reduce((s, r) => s + (r.difference || 0), 0),
        }
        return successResponse({ summary, sessions: rows })
      }

      case 'expense': {
        const where: any = {}
        if (hasDate) where.date = dateWhere
        const expenses = await db.expense.findMany({
          where,
          include: {
            category: true,
            user: { select: { id: true, name: true } },
          },
          orderBy: { date: 'desc' },
        })
        let byCategory: any[] | null = null
        if (groupBy === 'category') {
          const map = new Map<string, { name: string; total: number; count: number }>()
          for (const e of expenses) {
            const key = e.category.id
            if (!map.has(key)) map.set(key, { name: e.category.name, total: 0, count: 0 })
            const en = map.get(key)!
            en.total += e.amount
            en.count++
          }
          byCategory = Array.from(map.values()).sort((a, b) => b.total - a.total)
        }
        const summary = {
          count: expenses.length,
          total: expenses.reduce((s, e) => s + e.amount, 0),
          byMethod: expenses.reduce((acc, e) => {
            acc[e.paymentMethod] = (acc[e.paymentMethod] || 0) + e.amount
            return acc
          }, {} as Record<string, number>),
        }
        return successResponse({ summary, expenses, byCategory })
      }

      case 'loyalty': {
        const accounts = await db.loyaltyAccount.findMany({
          include: { customer: { select: { id: true, name: true, phone: true, tier: true } } },
        })
        const rows = accounts
          .map((a) => ({
            customer: a.customer,
            points: a.points,
            totalEarned: a.totalEarned,
            totalRedeemed: a.totalRedeemed,
            tier: a.tier,
          }))
          .sort((a, b) => b.points - a.points)
        const summary = {
          accountCount: rows.length,
          totalPoints: rows.reduce((s, r) => s + r.points, 0),
          totalEarned: rows.reduce((s, r) => s + r.totalEarned, 0),
          totalRedeemed: rows.reduce((s, r) => s + r.totalRedeemed, 0),
          byTier: rows.reduce((acc, r) => {
            acc[r.tier] = (acc[r.tier] || 0) + 1
            return acc
          }, {} as Record<string, number>),
        }
        return successResponse({ summary, accounts: rows })
      }

      case 'tax': {
        const where: any = { held: false }
        if (hasDate) where.createdAt = dateWhere
        const sales = await db.sale.findMany({
          where,
          include: { items: true },
        })
        const summary = {
          count: sales.length,
          totalSubtotal: sales.reduce((s, x) => s + x.subtotal, 0),
          totalTax: sales.reduce((s, x) => s + x.taxAmount, 0),
          total: sales.reduce((s, x) => s + x.total, 0),
          itemLevelTax: sales.reduce(
            (s, x) => s + x.items.reduce((ss, it) => ss + it.taxAmount, 0),
            0
          ),
        }
        return successResponse({ summary, sales })
      }

      default:
        return errorResponse(`نوع التقرير غير معروف: ${type}`, 400)
    }
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
