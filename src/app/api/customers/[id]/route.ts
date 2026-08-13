import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/customers/[id]
export const GET = withAuth('customers.view', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        loyaltyAccount: true,
        sales: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { items: { include: { product: true } } },
        },
        loyaltyTransactions: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!customer) return errorResponse('العميل غير موجود', 404)

    return successResponse(customer)
  } catch (e: unknown) {
    console.error('[customers/get] error:', e)
    return errorResponse('فشل تحميل العميل', 500)
  }
})

// PUT /api/customers/[id] - update customer
export const PUT = withAuth('customers.edit', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { name, phone, email, address, notes, birthday, tier, active } = body

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) return errorResponse('العميل غير موجود', 404)

    if (phone && phone !== existing.phone) {
      const dup = await db.customer.findUnique({ where: { phone } })
      if (dup) return errorResponse('رقم الهاتف مستخدم بالفعل', 409)
    }

    const customer = await db.customer.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(address !== undefined && { address: address || null }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(birthday !== undefined && { birthday: birthday ? new Date(birthday) : null }),
        ...(tier !== undefined && { tier }),
        ...(active !== undefined && { active }),
      },
      include: { loyaltyAccount: true },
    })

    // Sync tier to loyalty account
    if (tier && customer.loyaltyAccount) {
      await db.loyaltyAccount.update({
        where: { customerId: id },
        data: { tier },
      })
    }

    return successResponse(customer, 'تم تحديث العميل')
  } catch (e: unknown) {
    console.error('[customers/update] error:', e)
    return errorResponse('فشل تحديث العميل', 500)
  }
})

// DELETE /api/customers/[id] - soft delete (deactivate)
export const DELETE = withAuth('customers.delete', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) return errorResponse('العميل غير موجود', 404)

    const customer = await db.customer.update({
      where: { id },
      data: { active: false },
    })

    return successResponse(customer, 'تم تعطيل العميل')
  } catch (e: unknown) {
    console.error('[customers/delete] error:', e)
    return errorResponse('فشل تعطيل العميل', 500)
  }
})
