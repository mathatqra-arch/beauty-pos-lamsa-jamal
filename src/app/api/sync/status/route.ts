import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { successResponse, errorResponse, getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/sync/status
// ------------------------------------------------------------
// Returns the server-side sync status: current server time, the
// server API version, and (optionally) the count of pending sync
// operations plus the timestamp of the most recently recorded
// sync operation.
//
// Response:
//   {
//     success: true,
//     data: {
//       serverTime: ISO,
//       serverVersion: '1.0.0',
//       pendingOperations: number,
//       lastSyncAt: ISO | null
//     }
//   }
// ============================================================

const SERVER_VERSION = '1.0.0'

interface StatusResponseData {
  serverTime: string
  serverVersion: string
  pendingOperations: number
  lastSyncAt: string | null
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authentication required
    const user = await getSessionUser(req)
    if (!user) {
      return errorResponse('غير مصرح — يجب تسجيل الدخول', 401)
    }

    // 2. Compute pending operations + last sync timestamp.
    //    The `syncOperation` table is the conceptual idempotency
    //    table used by /api/sync/push. If it does not exist on the
    //    target Supabase yet, we degrade gracefully to zeros/nulls.
    let pendingOperations = 0
    let lastSyncAt: string | null = null

    try {
      // Count total recorded operations (used as a rough "synced so
      // far" indicator). Pending operations are tracked on the
      // desktop side, so the server reports 0 pending — the server
      // only knows about operations that have already been pushed.
      const allOps = await db.syncOperation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1,
      })
      if (Array.isArray(allOps) && allOps.length > 0) {
        const latest = allOps[0]
        const ts =
          (latest.createdAt as string | undefined) ||
          (latest.created_at as string | undefined)
        if (ts) lastSyncAt = ts
      }
    } catch {
      // SyncOperation table not present — report default values
      pendingOperations = 0
      lastSyncAt = null
    }

    // 3. Build the response
    const data: StatusResponseData = {
      serverTime: new Date().toISOString(),
      serverVersion: SERVER_VERSION,
      pendingOperations,
      lastSyncAt,
    }

    return successResponse(data, 'حالة المزامنة')
  } catch (e) {
    console.error('[sync/status] fatal error:', e)
    return errorResponse(
      (e as Error).message || 'خطأ داخلي في جلب حالة المزامنة',
      500,
    )
  }
}
