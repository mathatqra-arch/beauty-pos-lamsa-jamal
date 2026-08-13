import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/users - list all users (requires users.view permission)
export const GET = withAuth('users.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const result = users.map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions,
      active: u.active,
      // SECURITY: Do NOT return pin in API response (was previously leaked)
      createdAt: u.createdAt,
    }))

    return successResponse(result)
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})

// POST /api/users - create new user (admin only)
export const POST = withAuth('users.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { name, username, email, password, phone, role, pin, active } = body

    if (!name || !username || !password || !role) {
      return errorResponse('الاسم، المستخدم، كلمة المرور، والدور مطلوبون')
    }

    if (password.length < 6) {
      return errorResponse('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    }

    // Check unique username
    const existing = await db.user.findFirst({ where: { OR: [{ username }, { email: email || `${username}@beauty-pos.com` }] } })
    if (existing) {
      return errorResponse('اسم المستخدم أو البريد مستخدم بالفعل', 409)
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const permissions = getRolePermissions(role)

    const newUser = await db.user.create({
      data: {
        email: email || `${username}@beauty-pos.com`,
        username,
        passwordHash,
        name,
        phone: phone || null,
        role,
        permissions: JSON.stringify(permissions),
        pin: pin || null,
        active: active !== false,
      },
    })

    // Audit log — use session user (actor), not the new user being created
    await db.auditLog.create({
      data: {
        userId: user.id,  // ← from session, not body
        action: 'USER_CREATED',
        entity: 'User',
        entityId: newUser.id,
        before: null,
        after: JSON.stringify({ username, name, role }),
      }
    })

    return successResponse({
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      role: newUser.role,
    }, 'تم إنشاء الموظف بنجاح')
  } catch (e: unknown) {
    console.error('[users/create] error:', e)
    return errorResponse('فشل إنشاء الموظف', 500)
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
