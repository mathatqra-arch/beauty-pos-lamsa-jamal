import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/dashboard - dashboard summary stats (authenticated users only)
export const GET = withAuth('dashboard.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Fetch sales with date filters (flat queries — no nested relations)
    const [
      todaySales,
      weekSales,
      monthSales,
      lastWeekSalesArr,
      monthExpenses,
      totalCustomers,
      newCustomersThisMonth,
      totalProducts,
      inventoryProducts,
      weekSalesRaw,
      todayPaymentSales,
    ] = await Promise.all([
      db.sale.findMany({ where: { createdAt: { gte: todayStart }, held: false }, take: 1000 }),
      db.sale.findMany({ where: { createdAt: { gte: weekStart }, held: false }, take: 1000 }),
      db.sale.findMany({ where: { createdAt: { gte: monthStart }, held: false }, take: 1000 }),
      db.sale.findMany({ where: { createdAt: { gte: lastWeekStart, lt: weekStart }, held: false }, take: 1000 }),
      db.expense.findMany({ where: { date: { gte: monthStart } }, take: 1000 }),
      db.customer.count(),
      db.customer.count({ where: { createdAt: { gte: monthStart } } }),
      db.product.count(),
      db.product.findMany({ where: { trackStock: true }, take: 1000 }),
      db.sale.findMany({ where: { createdAt: { gte: weekStart }, held: false }, take: 1000 }),
      db.sale.findMany({ where: { createdAt: { gte: todayStart }, held: false }, take: 1000 }),
    ])

    // Get sale IDs for today and month (for SaleItem queries)
    const todaySaleIds = todaySales.map((s: any) => s.id)
    const monthSaleIds = monthSales.map((s: any) => s.id)

    // Fetch SaleItems for today and month
    const [todaySaleItems, monthSaleItems] = await Promise.all([
      todaySaleIds.length > 0
        ? db.saleItem.findMany({ where: { saleId: { in: todaySaleIds } }, take: 1000 })
        : [],
      monthSaleIds.length > 0
        ? db.saleItem.findMany({ where: { saleId: { in: monthSaleIds } }, take: 1000 })
        : [],
    ])

    // Fetch stock levels
    const stockLevels = await db.stockLevel.findMany({ take: 1000 })

    // Fetch products sold in last 30 days (for dead stock)
    const last30DaysSales = await db.sale.findMany({ where: { createdAt: { gte: last30Days } }, take: 1000 })
    const last30SaleIds = last30DaysSales.map((s: any) => s.id)
    const last30SaleItems = last30SaleIds.length > 0
      ? db.saleItem.findMany({ where: { saleId: { in: last30SaleIds } }, take: 2000 })
      : []

    // Calculate aggregates
    const todaySalesTotal = todaySales.reduce((s: number, sale: any) => s + (sale.total || 0), 0)
    const todayCount = todaySales.length
    const todayAvgOrder = todayCount > 0 ? todaySalesTotal / todayCount : 0

    const grossProfitToday = todaySaleItems.reduce((sum: number, it: any) =>
      sum + ((it.unitPrice || 0) - (it.costAtSale || 0)) * (it.quantity || 0), 0)
    const profitMargin = todaySalesTotal > 0 ? (grossProfitToday / todaySalesTotal) * 100 : 0

    const totalExpensesThisMonth = monthExpenses.reduce((s: number, e: any) => s + (e.amount || 0), 0)

    const thisWeekTotal = weekSales.reduce((s: number, sale: any) => s + (sale.total || 0), 0)
    const lastWeekTotal = lastWeekSalesArr.reduce((s: number, sale: any) => s + (sale.total || 0), 0)
    const weekGrowth = lastWeekTotal > 0
      ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100
      : thisWeekTotal > 0 ? 100 : 0

    // Inventory metrics
    let inventoryValue = 0, lowStockCount = 0, outOfStockCount = 0
    const deadStockProducts: any[] = []

    // Build stock map
    const stockMap = new Map<string, number>()
    for (const sl of stockLevels) {
      stockMap.set(sl.productId, (stockMap.get(sl.productId) || 0) + (sl.quantity || 0))
    }

    // Build sold products set (last 30 days)
    const last30Items = await last30SaleItems
    const soldProductIds30 = new Set(last30Items.map((i: any) => i.productId))

    for (const p of inventoryProducts) {
      const stock = stockMap.get(p.id) || 0
      inventoryValue += stock * (p.avgCost || 0)
      if (stock <= 0) outOfStockCount++
      else if (stock <= (p.reorderLevel || 0)) lowStockCount++
      if (stock > 0 && !soldProductIds30.has(p.id)) {
        deadStockProducts.push({ name: p.name, nameAr: p.nameAr, stock, value: stock * (p.avgCost || 0) })
      }
    }

    // Sales by day (last 7 days)
    const dayMap = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      dayMap.set(key, 0)
    }
    for (const s of weekSalesRaw) {
      const d = new Date(s.createdAt)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) || 0) + (s.total || 0))
    }
    const salesByDay = Array.from(dayMap.entries()).map(([day, sales]) => ({ day, sales, profit: sales * 0.3 }))

    // Top products (month)
    const prodMap = new Map<string, { name: string; nameAr: string; quantity: number; revenue: number }>()
    const productMap = new Map<string, any>(inventoryProducts.map((p: any): [string, any] => [p.id, p]))
    for (const it of monthSaleItems) {
      const product = productMap.get(it.productId) || { name: 'Unknown', nameAr: '' }
      if (!prodMap.has(it.productId)) {
        prodMap.set(it.productId, { name: product.name, nameAr: product.nameAr, quantity: 0, revenue: 0 })
      }
      const entry = prodMap.get(it.productId)!
      entry.quantity += it.quantity || 0
      entry.revenue += it.total || 0
    }
    const topProducts = Array.from(prodMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

    // Payment methods
    const methodLabels: Record<string, string> = { CASH: 'نقدي', CARD: 'بطاقة', TRANSFER: 'تحويل', SPLIT: 'مقسّم', OTHER: 'أخرى' }
    const payMap = new Map<string, number>()
    for (const s of todayPaymentSales) {
      payMap.set(s.paymentMethod, (payMap.get(s.paymentMethod) || 0) + (s.total || 0))
    }
    const salesByPaymentMethod = Array.from(payMap.entries()).map(([method, value]) => ({ name: methodLabels[method] || method, value }))

    // Sales by category
    const catMap = new Map<string, number>()
    const categories = await db.category.findMany({ take: 100 })
    const catMapById = new Map<string, any>(categories.map((c: any): [string, any] => [c.id, c]))
    for (const it of todaySaleItems) {
      const product = productMap.get(it.productId)
      const cat = product?.categoryId ? catMapById.get(product.categoryId) : null
      if (cat) {
        const name = cat.nameAr || cat.name
        catMap.set(name, (catMap.get(name) || 0) + (it.total || 0))
      }
    }
    const salesByCategory = Array.from(catMap.entries()).map(([name, value]) => ({ name, value }))

    // Smart insights
    const insights: { type: string; message: string }[] = []
    if (weekGrowth > 5) insights.push({ type: 'positive', message: `المبيعات ارتفعت ${weekGrowth.toFixed(1)}% مقارنة بالأسبوع الماضي` })
    else if (weekGrowth < -5) insights.push({ type: 'negative', message: `المبيعات انخفضت ${Math.abs(weekGrowth).toFixed(1)}% مقارنة بالأسبوع الماضي` })
    if (outOfStockCount > 0) insights.push({ type: 'warning', message: `${outOfStockCount} منتج نفد من المخزون` })
    if (lowStockCount > 0) insights.push({ type: 'warning', message: `${lowStockCount} منتج منخفض المخزون` })
    if (deadStockProducts.length > 0) insights.push({ type: 'warning', message: `${deadStockProducts.length} منتج لم يُبع منذ 30 يوم` })
    if (newCustomersThisMonth > 0) insights.push({ type: 'positive', message: `${newCustomersThisMonth} عميل جديد هذا الشهر` })
    insights.push({ type: 'info', message: `قيمة المخزون: ${inventoryValue.toFixed(2)} ج.م` })
    if (profitMargin > 30) insights.push({ type: 'positive', message: `هامش الربح: ${profitMargin.toFixed(1)}%` })

    const monthSalesTotal = monthSales.reduce((s: number, sale: any) => s + (sale.total || 0), 0)

    return successResponse({
      todaySales: todaySalesTotal,
      todayCount,
      avgOrderValue: todayAvgOrder,
      todayProfit: grossProfitToday,
      profitMargin: parseFloat(profitMargin.toFixed(1)),
      weekSales: thisWeekTotal,
      monthSales: monthSalesTotal,
      weekGrowth: parseFloat(weekGrowth.toFixed(1)),
      totalCustomers,
      newCustomersThisMonth,
      totalProducts,
      lowStockCount,
      outOfStockCount,
      inventoryValue,
      totalExpensesThisMonth,
      salesByDay,
      salesByCategory,
      salesByPaymentMethod,
      topProducts,
      insights,
    })
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
