import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// GET /api/settings - all settings grouped by category (authenticated)
export const GET = withAuth('settings.view', async (req: NextRequest, user: SessionUser) => {
  try {
    const settings = await db.setting.findMany({
      orderBy: { category: 'asc' },
    })

    const grouped: Record<string, Record<string, string>> = {}
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = {}
      grouped[s.category][s.key] = s.value
    }

    return successResponse({ grouped, flat: settings })
  } catch (e: unknown) {
    console.error('[settings/list] error:', e)
    return errorResponse('فشل تحميل الإعدادات', 500)
  }
})

// PUT /api/settings - update settings { settings: [{key, value, category?}] }
export const PUT = withAuth('settings.edit', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { settings } = body

    if (!Array.isArray(settings)) return errorResponse('settings يجب أن تكون مصفوفة')

    // Manual upsert: try update, if not found create
    for (const s of settings) {
      const existing = await db.setting.findUnique({ where: { key: s.key } })
      if (existing) {
        await db.setting.update({
          where: { key: s.key },
          data: { value: String(s.value) },
        })
      } else {
        await db.setting.create({
          data: {
            id: randomUUID(),
            key: s.key,
            value: String(s.value),
            category: s.category || 'general',
          },
        })
      }
    }

    // Audit log
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        action: 'SETTINGS_UPDATED',
        entity: 'Setting',
        after: JSON.stringify({ count: settings.length }),
      },
    })

    return successResponse({ updated: settings.length }, 'تم حفظ الإعدادات')
  } catch (e: unknown) {
    console.error('[settings/update] error:', e)
    return errorResponse('فشل حفظ الإعدادات', 500)
  }
})
