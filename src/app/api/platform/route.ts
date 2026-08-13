import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/platform - system-wide statistics for platform admin
export const GET = withAuth('system.view', async (req: NextRequest, user: SessionUser) => {
  try {
    // Get data volume statistics
    const [
      totalStores, totalUsers, totalProducts, totalCustomers,
      totalSales, totalSuppliers, totalPurchases, totalExpenses,
      totalStockMovements, totalAuditLogs, totalLoyaltyTransactions,
      totalCashSessions, totalSaleReturns, totalSettings,
      systemLocked, lockedReason,
    ] = await Promise.all([
      db.store.count(),
      db.user.count(),
      db.product.count(),
      db.customer.count(),
      db.sale.count(),
      db.supplier.count(),
      db.purchase.count(),
      db.expense.count(),
      db.stockMovement.count(),
      db.auditLog.count(),
      db.loyaltyTransaction.count(),
      db.cashSession.count(),
      db.saleReturn.count(),
      db.setting.count(),
      db.setting.findUnique({ where: { key: 'system.locked' } }),
      db.setting.findUnique({ where: { key: 'system.lockedReason' } }),
    ])

    // Calculate total data size estimate (based on record counts)
    const totalRecords = totalStores + totalUsers + totalProducts + totalCustomers +
      totalSales + totalSuppliers + totalPurchases + totalExpenses +
      totalStockMovements + totalAuditLogs + totalLoyaltyTransactions +
      totalCashSessions + totalSaleReturns + totalSettings

    // Estimate ~1KB per record average
    const estimatedDataSizeKB = totalRecords * 1
    const estimatedDataSizeMB = (estimatedDataSizeKB / 1024).toFixed(2)

    // Sales totals
    const salesAgg = await db.sale.aggregate({ _sum: { total: true } })
    const totalSalesRevenue = salesAgg._sum.total || 0

    // Recent activity (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentSales = await db.sale.count({ where: { createdAt: { gte: weekAgo } } })
    const recentAuditLogs = await db.auditLog.count({ where: { createdAt: { gte: weekAgo } } })

    // Users by role
    const users = await db.user.findMany({ select: { role: true } })
    const usersByRole: Record<string, number> = {}
    users.forEach(u => {
      usersByRole[u.role] = (usersByRole[u.role] || 0) + 1
    })

    // Database file size (approximate)
    const dbStats = {
      totalRecords,
      estimatedSizeMB: parseFloat(estimatedDataSizeMB),
      tables: {
        stores: totalStores,
        users: totalUsers,
        products: totalProducts,
        customers: totalCustomers,
        sales: totalSales,
        suppliers: totalSuppliers,
        purchases: totalPurchases,
        expenses: totalExpenses,
        stockMovements: totalStockMovements,
        auditLogs: totalAuditLogs,
        loyaltyTransactions: totalLoyaltyTransactions,
        cashSessions: totalCashSessions,
        saleReturns: totalSaleReturns,
        settings: totalSettings,
      },
    }

    return successResponse({
      systemLocked: systemLocked?.value === 'true',
      lockedReason: lockedReason?.value || '',
      totalSalesRevenue,
      recentSales,
      recentAuditLogs,
      usersByRole,
      database: dbStats,
      lastUpdated: new Date().toISOString(),
    })
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
