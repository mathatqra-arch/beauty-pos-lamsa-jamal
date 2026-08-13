import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/analytics/customers
export const GET = withAuth('analytics.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '20')

    const customers = await db.customer.findMany({
      where: { active: true },
      include: {
        loyaltyAccount: true,
        sales: {
          where: { held: false },
          select: {
            id: true,
            total: true,
            createdAt: true,
          },
        },
      },
    })

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const result = customers
      .map((c) => {
        const completedSales = c.sales
        const totalOrders = completedSales.length
        const totalSpending = completedSales.reduce((s, s2) => s + s2.total, 0)
        const avgOrderValue = totalOrders > 0 ? totalSpending / totalOrders : 0
        const lastPurchase =
          completedSales.length > 0
            ? completedSales.reduce((latest, s) => (s.createdAt > latest ? s.createdAt : latest), completedSales[0].createdAt)
            : null
        const newThisMonth = c.createdAt >= monthStart
        const returning = totalOrders > 1

        const { sales, ...rest } = c
        return {
          ...rest,
          loyaltyPoints: c.loyaltyAccount?.points || 0,
          tier: c.loyaltyAccount?.tier || c.tier,
          totalOrders,
          totalSpending,
          avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
          lastPurchase,
          lifetimeValue: totalSpending,
          isNew: newThisMonth,
          isReturning: returning,
        }
      })
      .sort((a, b) => b.totalSpending - a.totalSpending)

    const topCustomers = result.slice(0, limit)

    // Summary
    const totalCustomers = customers.length
    const newCustomers = result.filter((r) => r.isNew).length
    const returningCustomers = result.filter((r) => r.isReturning).length
    const totalSpending = result.reduce((s, r) => s + r.totalSpending, 0)
    const avgSpendPerCustomer = totalCustomers > 0 ? totalSpending / totalCustomers : 0

    const summary = {
      totalCustomers,
      newCustomers,
      returningCustomers,
      newVsReturningRatio: totalCustomers > 0 ? parseFloat(((newCustomers / totalCustomers) * 100).toFixed(2)) : 0,
      totalSpending,
      avgSpendPerCustomer: parseFloat(avgSpendPerCustomer.toFixed(2)),
      avgOrderValue:
        result.length > 0
          ? parseFloat((result.reduce((s, r) => s + r.avgOrderValue, 0) / result.length).toFixed(2))
          : 0,
      avgLifetimeValue: parseFloat(avgSpendPerCustomer.toFixed(2)),
    }

    return successResponse({
      summary,
      topCustomers,
      allCustomers: result,
    })
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
