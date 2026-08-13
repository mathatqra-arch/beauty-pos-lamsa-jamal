import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// PUT /api/users/[id] - update user
export const PUT = withAuth('users.edit', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { name, username, email, phone, role, pin, active, password } = body

    const data: any = {}
    if (name !== undefined) data.name = name
    if (username !== undefined) data.username = username
    if (email !== undefined) data.email = email
    if (phone !== undefined) data.phone = phone
    if (role !== undefined) {
      data.role = role
      data.permissions = JSON.stringify(getRolePermissions(role))
    }
    if (pin !== undefined) data.pin = pin
    if (active !== undefined) data.active = active
    if (password) {
      if (password.length < 6) return errorResponse('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      data.passwordHash = await bcrypt.hash(password, 10)
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: {
        id: true, username: true, name: true, email: true,
        phone: true, role: true, active: true,
      },
    })

    await db.auditLog.create({
      data: {
        userId: user.id,  // ← from session
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: id,
        after: JSON.stringify({ username, name, role }),
      }
    })

    return successResponse(updated, 'تم تحديث الموظف')
  } catch (e: unknown) {
    console.error('[users/update] error:', e)
    return errorResponse('فشل تحديث الموظف', 500)
  }
})

// DELETE /api/users/[id] - soft delete (deactivate)
export const DELETE = withAuth('users.delete', async (req: NextRequest, user: SessionUser, ctx?: any) => {
  try {
    const { id } = await ctx.params

    // Prevent self-deletion
    if (id === user.id) {
      return errorResponse('لا يمكنك حذف حسابك الخاص', 400)
    }

    // Soft delete - deactivate
    await db.user.update({ where: { id }, data: { active: false } })

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_DEACTIVATED',
        entity: 'User',
        entityId: id,
      }
    })

    return successResponse(null, 'تم تعطيل الموظف')
  } catch (e: unknown) {
    console.error('[users/delete] error:', e)
    return errorResponse('فشل تعطيل الموظف', 500)
  }
})

function getRolePermissions(role: string): string[] {
  switch (role) {
    case 'ADMIN':
    case 'OWNER':
      return ['all']
    case 'MANAGER':
      return ['sale.create', 'sale.refund', 'sale.discount', 'product.edit', 'inventory.adjust', 'report.view', 'profit.view', 'cash.open', 'cash.close', 'customer.create', 'customer.edit']
    case 'CASHIER':
      return ['sale.create', 'cash.open', 'cash.close']
    case 'WAREHOUSE':
      return ['product.edit', 'inventory.adjust', 'purchase.create']
    case 'ACCOUNTANT':
      return ['report.view', 'profit.view', 'expense.create', 'expense.view']
    default:
      return ['sale.create']
  }
}
