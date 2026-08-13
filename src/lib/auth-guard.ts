import { NextRequest } from 'next/server'
import { getSessionUser, hasPermission, errorResponse, SessionUser } from './auth'

// ============================================================
// AUTHORIZATION GUARD — Higher-Order Function
// ============================================================
// Wraps an API handler with authentication and permission checks.
//
// Usage:
//   export const GET = withAuth('products.view', async (req, user) => {
//     // ... handler logic
//   })
//
//   export const POST = withAuth('products.create', async (req, user) => {
//     // ... handler logic
//   })
//
// To allow any authenticated user (no specific permission needed):
//   export const GET = withAuth(async (req, user) => { ... })
//
// Public routes (login, setup) should NOT use this wrapper.
// ============================================================

type HandlerWithAuth = (
  req: NextRequest,
  user: SessionUser,
  ctx?: any
) => Promise<Response> | Response

type HandlerWithParams = (
  req: NextRequest,
  ctx: { params: Promise<{ [key: string]: string }> }
) => Promise<Response> | Response

/**
 * Wrap an API handler with authentication + optional permission check.
 * Returns 401 if no valid session, 403 if permission missing.
 * Injects the authenticated SessionUser as second arg to the handler.
 */
export function withAuth(permission: string | null, handler: HandlerWithAuth): HandlerWithParams {
  return async (req: NextRequest, ctx?: any) => {
    const user = await getSessionUser(req)
    if (!user) {
      return errorResponse('غير مصرح - يجب تسجيل الدخول', 401)
    }
    if (permission && !hasPermission(user, permission)) {
      return errorResponse('ممنوع - لا تملك الصلاحية المطلوبة', 403)
    }
    return handler(req, user, ctx)
  }
}

/**
 * Convenience wrapper: require only authentication, no specific permission.
 */
export function withAuthOnly(handler: HandlerWithAuth): HandlerWithParams {
  return withAuth(null, handler)
}

/**
 * Get the authenticated user or return 401.
 * Use this when you want manual control instead of withAuth wrapper.
 */
export async function requireAuth(req: NextRequest): Promise<SessionUser | Response> {
  const user = await getSessionUser(req)
  if (!user) {
    return errorResponse('غير مصرح - يجب تسجيل الدخول', 401)
  }
  return user
}

/**
 * Require a specific permission. Returns 403 if missing.
 * Use after requireAuth when you need conditional permission checks.
 */
export function requirePermission(user: SessionUser, permission: string): Response | null {
  if (!hasPermission(user, permission)) {
    return errorResponse('ممنوع - لا تملك الصلاحية المطلوبة', 403)
  }
  return null
}

/**
 * Extract client IP from request (for audit logging + rate limiting).
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri
  return 'unknown'
}

/**
 * Get user agent from request (for audit logging).
 */
export function getUserAgent(req: NextRequest): string {
  return req.headers.get('user-agent') || 'unknown'
}
