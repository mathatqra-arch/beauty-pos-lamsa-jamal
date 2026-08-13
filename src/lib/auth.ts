import { NextRequest } from 'next/server'
import { db } from './db'
import crypto from 'crypto'

// ============================================================
// SECURE AUTHENTICATION — Signed tokens (HMAC-SHA256)
// ============================================================
// Token format: <userId>.<timestamp>.<hmac>
// - userId: the user's ID
// - timestamp: when token was issued (for expiry)
// - hmac: HMAC-SHA256(userId.timestamp, JWT_SECRET)
//
// This prevents token forgery — an attacker cannot create
// a valid token without knowing JWT_SECRET (server-only).
// ============================================================

// JWT_SECRET resolution is LAZY — we do NOT throw at module load time.
//
// Why: `next build` evaluates every route module under NODE_ENV=production
// to collect page data. If we threw at the top level here, the build would
// fail whenever JWT_SECRET isn't set in the build environment (which is the
// common case — build servers / CI rarely have runtime secrets).
//
// Instead, we resolve the secret on first actual use (createToken/verifyToken)
// and throw there if it's missing in production. This lets the build succeed
// while still failing fast at request time if the deployment is misconfigured.
let _resolvedSecret: string | null = null
let _secretWarningShown = false

function getJwtSecret(): string {
  if (_resolvedSecret) return _resolvedSecret

  const envSecret = process.env.JWT_SECRET
  if (envSecret) {
    _resolvedSecret = envSecret
    return _resolvedSecret
  }

  // No env secret set.
  if (process.env.NODE_ENV === 'production') {
    // Throw at request time — build already succeeded because this fn isn't
    // called during page-data collection.
    throw new Error('JWT_SECRET environment variable is required in production. Set it in your deployment environment (e.g. Vercel Project Settings → Environment Variables).')
  }

  // Dev/test fallback: random secret (sessions reset on restart, but app boots).
  if (!_secretWarningShown) {
    console.warn('[AUTH] WARNING: JWT_SECRET not set — using random secret. Sessions will reset on restart.')
    _secretWarningShown = true
  }
  _resolvedSecret = crypto.randomBytes(32).toString('hex')
  return _resolvedSecret
}

const TOKEN_EXPIRY_HOURS = 24

export interface SessionUser {
  id: string
  username: string
  name: string
  role: string
  permissions: string[]
}

// Create a signed token
export function createToken(userId: string): string {
  const secret = getJwtSecret()
  const timestamp = Date.now()
  const payload = `${userId}.${timestamp}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

// Verify a signed token
export function verifyToken(token: string): { userId: string; valid: boolean } {
  const parts = token.split('.')
  if (parts.length !== 3) return { userId: '', valid: false }

  const [userId, timestampStr, hmac] = parts
  const timestamp = parseInt(timestampStr)

  // Check expiry
  const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60)
  if (ageHours > TOKEN_EXPIRY_HOURS) return { userId: '', valid: false }

  // Verify HMAC — use timingSafeEqual to prevent timing attacks
  // (previous code used `!==` which leaks byte-by-byte via response time)
  const secret = getJwtSecret()
  const payload = `${userId}.${timestampStr}`
  const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  // Constant-time comparison to prevent timing attacks (CWE-208)
  const a = Buffer.from(hmac, 'hex')
  const b = Buffer.from(expectedHmac, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { userId: '', valid: false }
  }

  return { userId, valid: true }
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.substring(7)
  const { userId, valid } = verifyToken(token)
  if (!valid) return null

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || user.active === false) return null

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : user.permissions,
  }
}

export function hasPermission(user: SessionUser | null, permission: string): boolean {
  if (!user) return false
  if (user.permissions.includes('all')) return true
  return user.permissions.includes(permission)
}

export function defaultUserId(): string {
  return 'admin'
}

export async function getDefaultUser(): Promise<string> {
  const user = await db.user.findFirst({ where: { role: 'ADMIN' } })
  return user?.id || ''
}

export function successResponse(data: any, message?: string) {
  return Response.json({ success: true, data: serializeData(data), message })
}

export function errorResponse(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status })
}

/**
 * Serialize data for JSON response.
 * Converts Prisma Decimal objects to numbers so the frontend doesn't
 * receive strings for money fields (which would break arithmetic).
 *
 * Prisma Decimal is a subclass of decimal.js Decimal.
 * We check for the toNumber method (duck typing) to avoid importing the class.
 */
function serializeData(obj: any): any {
  if (obj === null || obj === undefined) return obj

  // Prisma Decimal — has toNumber() method
  if (typeof obj === 'object' && typeof obj.toNumber === 'function' && typeof obj.toString === 'function') {
    return obj.toNumber()
  }

  // Date — convert to ISO string
  if (obj instanceof Date) {
    return obj.toISOString()
  }

  // BigInt — convert to number (Prisma uses BigInt for Int8)
  if (typeof obj === 'bigint') {
    return Number(obj)
  }

  // Array — recurse
  if (Array.isArray(obj)) {
    return obj.map(serializeData)
  }

  // Plain object — recurse
  if (typeof obj === 'object') {
    const result: any = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = serializeData(obj[key])
      }
    }
    return result
  }

  return obj
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2
  }).format(amount)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date)
}
