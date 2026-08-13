import { NextRequest } from 'next/server'
import { getClientIp } from './auth-guard'

// ============================================================
// IN-MEMORY RATE LIMITING
// ============================================================
// Simple sliding-window rate limiter using in-memory Map.
// Suitable for single-instance deployments (Vercel serverless functions
// may have multiple instances — for production at scale, switch to
// @upstash/ratelimit + @upstash/redis).
//
// For now this is enough to block brute-force attacks on /api/auth/login
// and /api/platform/lock from a single attacker.
// ============================================================

interface RateBucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateBucket>()

// Cleanup expired buckets every 5 minutes to avoid memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) {
      buckets.delete(key)
    }
  }
}

/**
 * Check if a request should be rate-limited.
 * Returns { success: true } if allowed, { success: false, retryAfter } if blocked.
 *
 * @param key - Unique identifier for the bucket (e.g. `login:${ip}` or `lock:${ip}`)
 * @param limit - Max requests allowed in the window
 * @param windowMs - Window size in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; retryAfter: number; remaining: number } {
  cleanup()
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt < now) {
    // Fresh window
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, retryAfter: 0, remaining: limit - 1 }
  }

  existing.count++
  if (existing.count > limit) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
    return { success: false, retryAfter, remaining: 0 }
  }

  return {
    success: true,
    retryAfter: 0,
    remaining: limit - existing.count,
  }
}

/**
 * Rate limit presets (per-IP).
 */
export const RATE_LIMITS = {
  // Login: 10 attempts per minute per IP (blocks brute-force)
  LOGIN: { limit: 10, windowMs: 60 * 1000 },
  // Setup: 5 attempts per hour per IP (blocks race-condition attack)
  SETUP: { limit: 5, windowMs: 60 * 60 * 1000 },
  // Platform lock: 3 per minute per IP (blocks DoS)
  PLATFORM_LOCK: { limit: 3, windowMs: 60 * 1000 },
  // Loyalty redeem: 20 per minute per IP
  LOYALTY_REDEEM: { limit: 20, windowMs: 60 * 1000 },
  // Sync push: 60 per minute per IP (legitimate clients sync ~1/min)
  SYNC_PUSH: { limit: 60, windowMs: 60 * 1000 },
  // Generic API: 100 per minute per IP
  API: { limit: 100, windowMs: 60 * 1000 },
} as const

/**
 * Apply rate limit to a request and return a 429 response if blocked.
 * Usage:
 *   const limited = applyRateLimit(req, 'login', RATE_LIMITS.LOGIN)
 *   if (limited) return limited
 */
export function applyRateLimit(
  req: NextRequest,
  action: string,
  preset: { limit: number; windowMs: number }
): Response | null {
  const ip = getClientIp(req)
  const key = `${action}:${ip}`
  const result = rateLimit(key, preset.limit, preset.windowMs)
  if (!result.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `طلبات كثيرة جداً. حاول مرة أخرى بعد ${result.retryAfter} ثانية.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Limit': String(preset.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }
  return null
}
