import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/customers - list with search
export const GET = withAuth('customers.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const tier = searchParams.get('tier')
    const active = searchParams.get('active')
    const limit = parseInt(searchParams.get('limit') || '100')

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ]
    }
    if (tier) where.tier = tier
    if (active !== null && active !== undefined) where.active = active === 'true'

    const customers = await db.customer.findMany({
      where,
      include: {
        loyaltyAccount: true,
        _count: { select: { sales: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(customers)
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})

// POST /api/customers - create new customer
export const POST = withAuth('customers.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { name, phone, email, address, notes, birthday, tier } = body

    if (!name) return errorResponse('اسم العميل مطلوب')

    if (phone) {
      const existing = await db.customer.findUnique({ where: { phone } })
      if (existing) return errorResponse('رقم الهاتف مستخدم بالفعل', 409)
    }

    const customer = await db.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: {
          id: body.id || undefined,
          name,
          phone: phone || null,
          email: email || null,
          address: address || null,
          notes: notes || null,
          birthday: birthday ? new Date(birthday) : null,
          tier: tier || 'BRONZE',
        },
      })

      // Auto-create loyalty account
      await tx.loyaltyAccount.create({
        data: {
          customerId: c.id,
          points: 0,
          totalEarned: 0,
          totalRedeemed: 0,
          tier: c.tier,
        },
      })

      return c
    })

    const withLoyalty = await db.customer.findUnique({
      where: { id: customer.id },
      include: { loyaltyAccount: true },
    })

    return successResponse(withLoyalty, 'تم إنشاء العميل بنجاح')
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
