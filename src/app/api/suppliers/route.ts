import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/suppliers - list with purchase summary
export const GET = withAuth('suppliers.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const suppliers = await db.supplier.findMany({
      where,
      include: {
        purchases: {
          select: { total: true, paidAmount: true, status: true },
        },
      },
      take: limit,
      orderBy: { name: 'asc' },
    })

    const result = suppliers.map((s) => {
      const totalPurchases = s.purchases.reduce((sum, p) => sum + p.total, 0)
      const totalPaid = s.purchases.reduce((sum, p) => sum + p.paidAmount, 0)
      const balance = s.purchases.reduce((sum, p) => sum + (p.total - p.paidAmount), 0)
      const { purchases, ...rest } = s
      return {
        ...rest,
        purchaseSummary: {
          totalPurchases,
          totalPaid,
          balance,
          count: s.purchases.length,
        },
      }
    })

    return successResponse(result)
  } catch (e: unknown) {
    console.error('[suppliers/list] error:', e)
    return errorResponse('فشل تحميل الموردين', 500)
  }
})

// POST /api/suppliers - create new supplier
export const POST = withAuth('suppliers.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { name, phone, email, address, taxId } = body

    if (!name) return errorResponse('اسم المورد مطلوب')

    const supplier = await db.supplier.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        taxId: taxId || null,
      },
    })

    return successResponse(supplier, 'تم إنشاء المورد بنجاح')
  } catch (e: unknown) {
    console.error('[suppliers/create] error:', e)
    return errorResponse('فشل إنشاء المورد', 500)
  }
})
