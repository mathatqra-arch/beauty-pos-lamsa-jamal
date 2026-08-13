import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const GET = withAuth('sale.view', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        customer: true, user: true, register: true,
        items: { include: { product: true } },
        payments: true, returns: { include: { items: true } },
      }
    })
    if (!sale) return errorResponse('الفاتورة غير موجودة', 404)
    return successResponse(sale)
  } catch (e: unknown) {
    console.error('[sale/get] error:', e)
    return errorResponse('فشل تحميل الفاتورة', 500)
  }
})
