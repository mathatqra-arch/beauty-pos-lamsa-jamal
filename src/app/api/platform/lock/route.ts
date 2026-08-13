import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getClientIp, getUserAgent } from '@/lib/auth-guard'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// Helper: manual upsert for settings
async function upsertSetting(key: string, value: string, category: string = 'system') {
  const existing = await db.setting.findUnique({ where: { key } })
  if (existing) {
    await db.setting.update({ where: { key }, data: { value } })
  } else {
    await db.setting.create({
      data: { id: randomUUID(), key, value, category }
    })
  }
}

// POST /api/platform/lock - lock or unlock the system (admin only)
export const POST = withAuth('system.lock', async (req: NextRequest, user: SessionUser) => {
  try {
    // Rate limit: 3 lock/unlock per minute per IP (blocks DoS)
    const limited = applyRateLimit(req, 'platform_lock', RATE_LIMITS.PLATFORM_LOCK)
    if (limited) return limited

    // SECURITY: userId from session only — previously took from body
    const { locked, reason } = await req.json()

    await upsertSetting('system.locked', locked ? 'true' : 'false')
    await upsertSetting('system.lockedReason', reason || '')

    // Log audit — always with session user + IP + device
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        action: locked ? 'SYSTEM_LOCKED' : 'SYSTEM_UNLOCKED',
        entity: 'System',
        after: JSON.stringify({ locked, reason }),
        ipAddress: getClientIp(req),
        device: getUserAgent(req),
      }
    })

    return successResponse({
      locked,
      reason: reason || '',
    }, locked ? 'تم قفل النظام' : 'تم فتح النظام')
  } catch (e: unknown) {
    console.error('[platform/lock] error:', e)
    return errorResponse('فشل تحديث حالة النظام', 500)
  }
})
