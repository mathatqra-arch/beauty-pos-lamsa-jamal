import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { successResponse, errorResponse, getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ============================================================
// GET /api/sync/pull
// ------------------------------------------------------------
// Delta sync for Desktop clients — returns only the records that
// changed since the supplied `since` cursor.
//
// Query params:
//   ?since=ISO_TIMESTAMP
//   &entities=products,categories,customers,suppliers,sales,expenses
//
// Response:
//   {
//     success: true,
//     data: {
//       entities: {
//         products: { records: [], deleted: [], lastUpdated: '' },
//         ...
//       },
//       serverTime: ISO
//     }
//   }
//
// Notes:
//   - `since` is optional. When omitted, ALL records are returned
//     (initial sync). When provided, only records with
//     `updatedAt > since` (or `createdAt > since` for tables that
//     lack an `updatedAt` column) are returned.
//   - `deleted` is reserved for soft-deleted records (i.e. records
//     that carry a `deletedAt` field). None of the current tables
//     use `deletedAt`, so this array will be empty today — the
//     field exists so the response shape is forward-compatible.
//   - `lastUpdated` is the maximum `updatedAt` (or `createdAt`)
//     among the returned records. The Desktop should use this as
//     its next `since` cursor.
// ============================================================

// All entities supported by the pull endpoint
const ALL_ENTITIES = [
  'products',
  'categories',
  'customers',
  'suppliers',
  'sales',
  'expenses',
  'purchases',
  'expense_categories',
  'loyalty_accounts',
  'loyalty_transactions',
  'cash_sessions',
  'cash_movements',
  'stock_movements',
  'settings',
  'audit_logs',
  'stock_levels',
  'registers',
] as const

type EntityName = (typeof ALL_ENTITIES)[number]

interface EntityResult {
  records: Array<Record<string, unknown>>
  deleted: string[]
  lastUpdated: string | null
}

interface PullResponseData {
  entities: Record<EntityName, EntityResult>
  serverTime: string
}

// Tables that have an `updatedAt` column on Supabase
const TABLES_WITH_UPDATED_AT: Record<EntityName, boolean> = {
  products: true,
  categories: false,
  customers: true,
  suppliers: false,
  sales: true,
  expenses: false,
  purchases: false,
  expense_categories: false,
  loyalty_accounts: true,
  loyalty_transactions: false,
  cash_sessions: false,
  cash_movements: false,
  stock_movements: false,
  settings: true,
  audit_logs: false,
  stock_levels: true,
  registers: false,
}

// Map entity names → db model accessor keys on `db`
const MODEL_KEYS: Record<EntityName, keyof typeof db> = {
  products: 'product',
  categories: 'category',
  customers: 'customer',
  suppliers: 'supplier',
  sales: 'sale',
  expenses: 'expense',
  purchases: 'purchase',
  expense_categories: 'expenseCategory',
  loyalty_accounts: 'loyaltyAccount',
  loyalty_transactions: 'loyaltyTransaction',
  cash_sessions: 'cashSession',
  cash_movements: 'cashMovement',
  stock_movements: 'stockMovement',
  settings: 'setting',
  audit_logs: 'auditLog',
  stock_levels: 'stockLevel',
  registers: 'register',
}

/**
 * Pull a single entity's changed records since the supplied cursor.
 * Falls back to `createdAt` for tables that do not have `updatedAt`.
 */
async function pullEntity(
  entity: EntityName,
  since: Date | null,
): Promise<EntityResult> {
  const modelKey = MODEL_KEYS[entity] as string
  // The `db` object is a plain const literal — use a typed cast so
  // TypeScript does not complain about dynamic property access.
  const model = (db as unknown as Record<string, unknown>)[modelKey] as {
    findMany: (opts: {
      where?: Record<string, unknown>
      orderBy?: Record<string, string>
      take?: number
    }) => Promise<Array<Record<string, unknown>>>
  }

  const where: Record<string, unknown> = {}
  if (since) {
    const hasUpdatedAt = TABLES_WITH_UPDATED_AT[entity]
    const field = hasUpdatedAt ? 'updatedAt' : 'createdAt'
    where[field] = { gt: since }
  }

  let records: Array<Record<string, unknown>> = []
  try {
    records = await model.findMany({
      where,
      orderBy: TABLES_WITH_UPDATED_AT[entity]
        ? { updatedAt: 'desc' }
        : { createdAt: 'desc' },
      take: 5000,
    })
  } catch (e) {
    // Surface the error as an empty result so the rest of the
    // batch can still succeed — the desktop client will retry on
    // the next pull cycle.
    console.error(
      `[sync/pull] failed to fetch ${entity}:`,
      (e as Error).message,
    )
    return { records: [], deleted: [], lastUpdated: null }
  }

  // Compute the next cursor — max of `updatedAt` (or `createdAt`)
  let lastUpdated: string | null = null
  for (const rec of records) {
    const ts =
      (rec.updatedAt as string | undefined) ||
      (rec.createdAt as string | undefined)
    if (ts && (!lastUpdated || ts > lastUpdated)) {
      lastUpdated = ts
    }
  }

  // Soft-deleted records (records whose `deletedAt` is set and
  // newer than `since`). Currently no Supabase table exposes
  // `deletedAt`, so this returns []. Kept for forward compatibility.
  const deleted: string[] = []

  return { records, deleted, lastUpdated }
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authentication required
    const user = await getSessionUser(req)
    if (!user) {
      return errorResponse('غير مصرح — يجب تسجيل الدخول', 401)
    }

    // 2. Parse query params
    const { searchParams } = new URL(req.url)
    const sinceRaw = searchParams.get('since')
    const entitiesRaw = searchParams.get('entities')

    // Validate `since` if provided
    let since: Date | null = null
    if (sinceRaw) {
      const parsed = new Date(sinceRaw)
      if (Number.isNaN(parsed.getTime())) {
        return errorResponse(
          'قيمة `since` غير صالحة — توقع ISO timestamp',
          400,
        )
      }
      since = parsed
    }

    // Resolve the set of entities to pull
    let requestedEntities: readonly EntityName[]
    if (entitiesRaw && entitiesRaw.trim()) {
      const parts = entitiesRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      const invalid = parts.filter(
        (p) => !ALL_ENTITIES.includes(p as EntityName),
      )
      if (invalid.length > 0) {
        return errorResponse(
          `كيانات غير مدعومة: ${invalid.join(', ')}. القيم المدعومة: ${ALL_ENTITIES.join(', ')}`,
          400,
        )
      }
      requestedEntities = parts as EntityName[]
    } else {
      // Default: pull all supported entities
      requestedEntities = ALL_ENTITIES
    }

    // 3. Pull each entity in parallel for speed
    const entityResults = await Promise.all(
      requestedEntities.map(async (entity) => {
        const result = await pullEntity(entity, since)
        return [entity, result] as const
      }),
    )

    // 4. Assemble response — always include all 6 entity keys (even
    //    those that were not requested, so the client can rely on
    //    a stable response shape)
    const entities = {} as Record<EntityName, EntityResult>
    for (const entity of ALL_ENTITIES) {
      const found = entityResults.find(([name]) => name === entity)
      entities[entity] = found
        ? found[1]
        : { records: [], deleted: [], lastUpdated: null }
    }

    const data: PullResponseData = {
      entities,
      serverTime: new Date().toISOString(),
    }

    return successResponse(data, 'تم جلب التغييرات بنجاح')
  } catch (e) {
    console.error('[sync/pull] fatal error:', e)
    return errorResponse(
      (e as Error).message || 'خطأ داخلي في جلب التغييرات',
      500,
    )
  }
}
