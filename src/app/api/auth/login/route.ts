import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { successResponse, errorResponse, createToken } from '@/lib/auth'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, getUserAgent } from '@/lib/auth-guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 login attempts per minute per IP (blocks brute-force)
    const limited = applyRateLimit(req, 'login', RATE_LIMITS.LOGIN)
    if (limited) return limited

    const { username, password } = await req.json()
    if (!username || !password) {
      return errorResponse('اسم المستخدم وكلمة المرور مطلوبان')
    }

    const user = await db.user.findFirst({
      where: { OR: [{ username }, { email: username }] }
    })

    // Use unified error message to prevent user enumeration (CWE-204)
    // Previous code returned different messages for "user not found" vs "wrong password"
    const INVALID_CREDENTIALS = 'بيانات الدخول غير صحيحة'

    if (!user) {
      return errorResponse(INVALID_CREDENTIALS, 401)
    }
    if (!user.active) {
      return errorResponse('الحساب غير مفعل', 403)
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return errorResponse(INVALID_CREDENTIALS, 401)
    }

    // Log audit with IP + device info (previously missing)
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        ipAddress: getClientIp(req),
        device: getUserAgent(req),
      }
    })

    // Create SIGNED token (HMAC-SHA256)
    const token = createToken(user.id)

    // SECURITY: Do NOT return `pin` in the login response.
    // Previous code returned user.pin which leaked the quick-login PIN
    // to the client and stored it in localStorage, making it vulnerable
    // to XSS attacks. PIN verification now requires a separate endpoint.
    return successResponse({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: JSON.parse(user.permissions || '[]'),
        phone: user.phone,
      }
    }, 'تم تسجيل الدخول بنجاح')
  } catch (e: unknown) {
    // Don't leak internal error messages
    console.error('[auth/login] error:', e)
    return errorResponse('فشل تسجيل الدخول، حاول مرة أخرى', 500)
  }
}
