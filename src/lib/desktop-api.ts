// ============================================================
// UNIVERSAL OFFLINE DATA LAYER — DESKTOP MODE
// ============================================================
// This intercepts ALL apiFetch calls in desktop mode.
// When in Tauri: reads/writes go to local SQLite (PRIMARY store)
// Sync engine pushes to remote API when online (background)
// ============================================================

import { isDesktop } from './desktop-mode'
import { useAuthStore } from './store'

const PRODUCTION_URL = 'https://beauty-pos-lamsa-jamal.vercel.app'

let sqlDb: any = null
let seeded = false
let dbInitPromise: Promise<any> | null = null

/**
 * Extract error message from Tauri SQL errors.
 * Tauri plugin-sql throws errors as STRINGS, not Error objects.
 */
function sqlErrorMsg(e: any): string {
  if (!e) return 'unknown SQL error'
  if (typeof e === 'string') return e
  if (e.message) return e.message
  if (typeof e.toString === 'function') {
    const s = e.toString()
    if (s && s !== '[object Object]') return s
  }
  return 'unknown SQL error'
}

/**
 * Insert a row, or update it in place if the id already exists — WITHOUT
 * touching any column not passed in `columns`. This replaces INSERT OR
 * REPLACE, which deletes the whole old row and reinserts only the given
 * columns, silently resetting every other column to its default/NULL.
 * That was wiping local-only fields (e.g. products.description, which
 * exists in pos.db but not in the remote Supabase schema) on every sync.
 */
async function upsert(db: any, table: string, columns: string[], values: any[], secondaryConflictCol?: string) {
  const updateCols = columns.filter(c => c !== 'id')
  const setClause = updateCols.length
    ? `DO UPDATE SET ${updateCols.map(c => `${c} = excluded.${c}`).join(', ')}`
    : 'DO NOTHING'

  let sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(id) ${setClause}`

  // A second unique column (e.g. products.sku, customers.phone) can collide
  // under a DIFFERENT id — this happens with rows created before ids were
  // synced consistently between the desktop app and the server. Update that
  // existing row in place, including adopting the incoming id, instead of
  // failing the whole sync.
  if (secondaryConflictCol && columns.includes(secondaryConflictCol)) {
    const secUpdateCols = columns.filter(c => c !== secondaryConflictCol)
    const secSetClause = secUpdateCols.length
      ? `DO UPDATE SET ${secUpdateCols.map(c => `${c} = excluded.${c}`).join(', ')}`
      : 'DO NOTHING'
    sql += `\n     ON CONFLICT(${secondaryConflictCol}) ${secSetClause}`
  }

  await db.execute(sql, values)
}

export async function getDb(): Promise<any> {
  if (sqlDb) return sqlDb
  if (!isDesktop()) return null
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    try {
      // Import the plugin — use default export (Tauri plugin-sql v2.4.0)
      const mod = await import('@tauri-apps/plugin-sql')
      const Database = mod.default || (mod as any).Database

      if (!Database || typeof Database.load !== 'function') {
        throw new Error('Database class not found in @tauri-apps/plugin-sql')
      }

      sqlDb = await Database.load('sqlite:pos.db')

      // PRAGMA foreign_keys is now handled by Migration 003 (Rust-side).
      // The migration system runs before Database.load() returns, so
      // the schema is guaranteed to be ready.
      //
      // We still set PRAGMA here as a safety net — it's a per-connection
      // setting in SQLite, so new connections need it re-applied.
      try {
        await sqlDb.execute('PRAGMA foreign_keys = ON')
      } catch (e: any) {
        console.warn('[Desktop DB] PRAGMA foreign_keys = ON failed:', sqlErrorMsg(e))
      }

      // Schema patches (ALTER TABLE, indexes, sync_queue cleanup) are now
      // handled by Migration 003 in Rust. No more runtime patchSchema().
      // This was the root cause of the "sql.execute not allowed" errors —
      // patchSchema() used db.execute() which requires sql:allow-execute.
      // Now migrations run through tauri-plugin-sql's Rust migration system.

      // Seed admin user on first run (needs bcrypt — JS-only, can't run in Rust)
      if (!seeded) {
        await seedAdminUser(sqlDb)
        seeded = true
      }

      console.log('[Desktop DB] SQLite initialized successfully (migrations applied via Rust)')
      return sqlDb
    } catch (e: any) {
      console.error('[Desktop DB] Failed to load SQLite:', sqlErrorMsg(e))
      console.error('[Desktop DB] Full error object:', e)
      return null
    }
  })()

  return dbInitPromise
}

/**
 * patchSchema() was REMOVED — all schema patches now handled by
 * Migration 003 in Rust (migrations/003_desktop_schema_patches.sql).
 *
 * Previously this function ran ALTER TABLE, CREATE INDEX, and
 * sync_queue cleanup via db.execute() at runtime, which required
 * sql:allow-execute permission. Now these operations run through
 * tauri-plugin-sql's Rust migration system before Database.load()
 * returns, so the schema is guaranteed to be ready.
 *
 * The following patches were moved to Migration 003:
 * - suppliers.active, products.description, customers.notes
 * - deleted_at on 16 tables
 * - client_txn_id on 6 transactional tables
 * - updated_at on 13 tables
 * - device_id on sync_queue
 * - sync_queue dedup + unique index
 * - sync performance indexes
 * - sale_payments table
 * - sync_metadata table
 */

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// ============================================================
// SEED — Create admin user on first run
// ============================================================
// SECURITY: The default password '123456' is for TESTING ONLY.
// In production, the first-run setup screen should force the user
// to create their own admin credentials. The PIN is null — must
// be set explicitly by the admin after first login.
// ============================================================
async function seedAdminUser(db: any) {
  try {
    const users = await db.select('SELECT COUNT(*) as count FROM users')
    if (users[0]?.count > 0) {
      console.log('[Desktop DB] Already seeded, skipping')
      return
    }

    const bcrypt = await import('bcryptjs')
    // Default password for testing — should be changed on first login
    const passwordHash = await bcrypt.hash('123456', 10)

    const id = uuid()
    await db.execute(
      `INSERT INTO users (id, email, username, password_hash, name, role, permissions, active, pin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
      // PIN is null — admin must set it explicitly after first login
      [id, 'admin@lamsa-jamal.com', 'admin', passwordHash, 'مدير المتجر', 'ADMIN', JSON.stringify(['all']), null]
    )

    const storeId = uuid()
    await db.execute(
      `INSERT INTO stores (id, name, address, phone, currency, receipt_footer, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [storeId, 'لمسة جمال - مستحضرات تجميل', 'شارع التحرير، القاهرة', '0223456789', 'EGP', 'لمسة جمال - جمالكِ يبدأ من هنا ✨']
    )

    const warehouseId = uuid()
    await db.execute(
      `INSERT INTO warehouses (id, name, store_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [warehouseId, 'المخزن الرئيسي', storeId]
    )

    const categories = [
      { name: 'Perfumes', nameAr: 'العطور', color: '#e11d48' },
      { name: 'Makeup', nameAr: 'المكياج', color: '#ec4899' },
      { name: 'Skincare', nameAr: 'العناية بالبشرة', color: '#8b5cf6' },
      { name: 'Haircare', nameAr: 'العناية بالشعر', color: '#f59e0b' },
      { name: 'Body Care', nameAr: 'العناية بالجسم', color: '#10b981' },
      { name: 'Beauty Tools', nameAr: 'أدوات التجميل', color: '#06b6d4' },
      { name: 'Offers', nameAr: 'العروض', color: '#ef4444' },
    ]
    for (const c of categories) {
      await db.execute(
        `INSERT INTO categories (id, name, name_ar, color, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuid(), c.name, c.nameAr, c.color]
      )
    }

    const expCats = [
      { name: 'Rent', nameAr: 'إيجار', color: '#ef4444' },
      { name: 'Electricity', nameAr: 'كهرباء', color: '#f59e0b' },
      { name: 'Internet', nameAr: 'إنترنت', color: '#3b82f6' },
      { name: 'Salary', nameAr: 'رواتب', color: '#10b981' },
      { name: 'Other', nameAr: 'أخرى', color: '#6b7280' },
    ]
    for (const c of expCats) {
      await db.execute(
        `INSERT INTO expense_categories (id, name, name_ar, color, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuid(), c.name, c.nameAr, c.color]
      )
    }

    const tiers = [
      { name: 'BRONZE', displayName: 'برونزي', minPoints: 0, multiplier: 1.0, discount: 0, color: '#cd7f32' },
      { name: 'SILVER', displayName: 'فضي', minPoints: 500, multiplier: 1.2, discount: 5, color: '#c0c0c0' },
      { name: 'GOLD', displayName: 'ذهبي', minPoints: 1500, multiplier: 1.5, discount: 10, color: '#ffd700' },
      { name: 'VIP', displayName: 'VIP', minPoints: 3000, multiplier: 2.0, discount: 15, color: '#9333ea' },
    ]
    for (const t of tiers) {
      await db.execute(
        `INSERT INTO loyalty_tiers (id, name, display_name, min_points, earning_multiplier, discount_percent, color) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), t.name, t.displayName, t.minPoints, t.multiplier, t.discount, t.color]
      )
    }

    const settings = [
      ['loyalty.enabled', 'true', 'loyalty'],
      ['loyalty.pointsPerEgp', '0.1', 'loyalty'],
      ['loyalty.egpPerPoint', '0.05', 'loyalty'],
      ['loyalty.minRedeem', '500', 'loyalty'],
      ['tax.defaultRate', '14', 'tax'],
      ['receipt.width', '80', 'receipt'],
      ['receipt.autoPrint', 'true', 'receipt'],
      ['receipt.cutPaper', 'true', 'receipt'],
      ['receipt.openDrawer', 'true', 'receipt'],
      ['currency', 'EGP', 'general'],
      ['language', 'ar', 'general'],
      ['store.name', 'لمسة جمال', 'general'],
      ['system.locked', 'false', 'system'],
    ]
    for (const [key, value, category] of settings) {
      await db.execute('INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', [key, value, category])
    }

    console.log('[Desktop DB] Seeded admin user and default data')
  } catch (e) {
    console.error('[Desktop DB] Seed error:', sqlErrorMsg(e))
  }
}

// Map API paths to SQLite tables (longer paths first)
const TABLE_MAP: Record<string, string> = {
  '/products': 'products',
  '/categories': 'categories',
  '/customers': 'customers',
  '/suppliers': 'suppliers',
  '/sales': 'sales',
  '/inventory/movements': 'stock_movements',
  '/inventory': 'products',
  '/loyalty/campaigns': 'loyalty_campaigns',
  '/loyalty': 'loyalty_accounts',
  '/cash': 'cash_sessions',
  '/expenses/categories': 'expense_categories',
  '/expenses': 'expenses',
  '/purchases': 'purchases',
  '/audit': 'audit_logs',
  '/users': 'users',
  '/settings': 'settings',
  '/dashboard': 'dashboard',
  '/reports': 'reports',
  '/platform': 'platform',
}

const SCHEMA: Record<string, { table: string, columns: string[] }> = {
  products: {
    table: 'products',
    columns: ['id', 'name', 'name_ar', 'sku', 'barcode', 'category_id', 'brand_id', 'unit_id', 'supplier_id',
      'purchase_cost', 'selling_price', 'wholesale_price', 'tax_rate', 'min_stock', 'reorder_level',
      'track_stock', 'allow_negative_stock', 'avg_cost', 'image', 'description', 'active', 'current_stock',
      'created_at', 'updated_at', 'deleted_at']
  },
  categories: { table: 'categories', columns: ['id', 'name', 'name_ar', 'parent_id', 'color', 'icon', 'created_at', 'updated_at', 'deleted_at'] },
  customers: {
    table: 'customers',
    columns: ['id', 'name', 'phone', 'email', 'address', 'notes', 'birthday', 'tier', 'active',
      'loyalty_points', 'total_earned', 'total_redeemed', 'created_at', 'updated_at', 'deleted_at']
  },
  suppliers: { table: 'suppliers', columns: ['id', 'name', 'phone', 'email', 'address', 'tax_id', 'balance', 'active', 'created_at', 'updated_at', 'deleted_at'] },
  sales: {
    table: 'sales',
    columns: ['id', 'client_txn_id', 'invoice_number', 'customer_id', 'user_id', 'items_json',
      'subtotal', 'discount_amount', 'tax_amount', 'total', 'paid_amount', 'change_amount',
      'payment_method', 'payment_details', 'loyalty_earned', 'loyalty_redeemed', 'note',
      'status', 'sync_status', 'created_at', 'updated_at', 'deleted_at']
  },
  expenses: { table: 'expenses', columns: ['id', 'client_txn_id', 'category_id', 'user_id', 'amount', 'payment_method', 'note', 'date', 'sync_status', 'created_at', 'updated_at', 'deleted_at'] },
  expense_categories: { table: 'expense_categories', columns: ['id', 'name', 'name_ar', 'color', 'created_at'] },
  settings: { table: 'settings', columns: ['key', 'value', 'category', 'updated_at'] },
  users: { table: 'users', columns: ['id', 'email', 'username', 'password_hash', 'name', 'phone', 'role', 'permissions', 'active', 'pin', 'created_at', 'updated_at', 'deleted_at'] },
  loyalty_accounts: { table: 'loyalty_accounts', columns: ['id', 'customer_id', 'points', 'total_earned', 'total_redeemed', 'tier', 'updated_at', 'deleted_at'] },
  loyalty_transactions: { table: 'loyalty_transactions', columns: ['id', 'client_txn_id', 'customer_id', 'type', 'points', 'ref_type', 'ref_id', 'note', 'sync_status', 'created_at', 'updated_at', 'deleted_at'] },
  loyalty_campaigns: { table: 'loyalty_campaigns', columns: ['id', 'name', 'description', 'start_date', 'end_date', 'tier_filter', 'points_multiplier', 'bonus_points', 'min_purchase', 'active', 'created_at'] },
  cash_sessions: { table: 'cash_sessions', columns: ['id', 'user_id', 'register_id', 'opening_balance', 'closing_balance', 'expected_cash', 'difference', 'status', 'opened_at', 'closed_at', 'updated_at', 'deleted_at'] },
  cash_movements: { table: 'cash_movements', columns: ['id', 'client_txn_id', 'session_id', 'type', 'amount', 'note', 'ref_type', 'ref_id', 'sync_status', 'created_at', 'updated_at', 'deleted_at'] },
  purchases: { table: 'purchases', columns: ['id', 'client_txn_id', 'invoice_number', 'supplier_id', 'user_id', 'warehouse_id', 'subtotal', 'tax_amount', 'discount_amount', 'total', 'paid_amount', 'status', 'note', 'created_at', 'updated_at', 'deleted_at'] },
  audit_logs: { table: 'audit_logs', columns: ['id', 'user_id', 'action', 'entity', 'entity_id', 'before', 'after', 'created_at', 'updated_at', 'deleted_at'] },
  stock_movements: { table: 'stock_movements', columns: ['id', 'client_txn_id', 'product_id', 'warehouse_id', 'type', 'quantity', 'ref_type', 'ref_id', 'note', 'user_id', 'sync_status', 'created_at', 'updated_at', 'deleted_at'] },
  stock_levels: { table: 'stock_levels', columns: ['id', 'product_id', 'warehouse_id', 'quantity', 'updated_at'] },
  registers: { table: 'registers', columns: ['id', 'name', 'store_id', 'active', 'created_at'] },
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function rowToCamel(row: any): any {
  if (!row) return null
  const result: any = {}
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value
  }
  return result
}

function objToSnake(obj: any): any {
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCase(key)] = value
  }
  return result
}

// ============================================================
// MAIN: Handle API request locally via SQLite
// ============================================================

export async function desktopApiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const db = await getDb()
  if (!db) {
    throw new Error('قاعدة البيانات المحلية غير متاحة - فشل تحميل SQLite')
  }

  const method = options.method || 'GET'
  const tableName = getTableName(path)
  const pathParts = path.split('/').filter(Boolean)
  const entityId = pathParts.length > 1 && pathParts[pathParts.length - 2] !== 'api' ? pathParts[pathParts.length - 1] : null

  try {
    switch (method) {
      case 'GET': return await handleGet(db, tableName, path, entityId)
      case 'POST': return await handlePost(db, tableName, path, options)
      case 'PUT': return await handlePut(db, tableName, entityId || '', options)
      case 'DELETE': return await handleDelete(db, tableName, entityId || '')
      default: throw new Error(`Method ${method} not supported offline`)
    }
  } catch (e: any) {
    // Wrap all errors with readable messages and path info
    const msg = sqlErrorMsg(e)
    console.error(`[Desktop API] ${method} ${path} failed:`, msg)
    throw new Error(msg)
  }
}

function getTableName(path: string): string {
  const cleanPath = path.replace(/^\//, '').split('?')[0]
  for (const [apiPath, table] of Object.entries(TABLE_MAP)) {
    if (cleanPath.startsWith(apiPath.replace(/^\//, ''))) return table
  }
  return cleanPath.split('/')[0]
}

// ============================================================
// GET
// ============================================================
async function handleGet(db: any, tableName: string, path: string, entityId: string | null): Promise<any> {
  const schema = SCHEMA[tableName]

  if (path.includes('/dashboard')) return handleDashboard(db)
  if (path.includes('/inventory') && !path.includes('/movements')) return handleInventory(db, path)
  if (path.includes('/inventory/movements')) {
    const rows = await db.select('SELECT * FROM stock_movements WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100')
    return rows.map(rowToCamel)
  }
  if (path.includes('/loyalty') && path.includes('/campaigns')) {
    const rows = await db.select('SELECT * FROM loyalty_campaigns ORDER BY created_at DESC')
    return rows.map(rowToCamel)
  }
  if (path.includes('/loyalty') && !path.includes('/campaigns')) {
    // loyalty_accounts is soft-deletable (migration 002) — filter deleted rows.
    const rows = await db.select('SELECT la.*, c.name as customer_name, c.phone as customer_phone FROM loyalty_accounts la JOIN customers c ON la.customer_id = c.id WHERE la.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY la.points DESC')
    return rows.map(rowToCamel)
  }
  if (path.includes('/cash')) return handleCash(db, path)
  if (path.includes('/expenses/categories')) {
    // expense_categories has no deleted_at column — no filter.
    const rows = await db.select('SELECT * FROM expense_categories ORDER BY name')
    return rows.map(rowToCamel)
  }
  if (path.includes('/expenses')) {
    const rows = await db.select('SELECT e.*, ec.name as category_name, ec.name_ar as category_name_ar, u.name as user_name FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id LEFT JOIN users u ON e.user_id = u.id WHERE e.deleted_at IS NULL ORDER BY e.date DESC LIMIT 100')
    return rows.map(rowToCamel)
  }
  if (path.includes('/purchases')) {
    const rows = await db.select('SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 100')
    return rows.map(rowToCamel)
  }
  if (path.includes('/audit')) {
    // audit_logs: per PHASE-1C spec, hard-deleted — no deleted_at filter here.
    const rows = await db.select('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100')
    return rows.map(rowToCamel)
  }
  if (path.includes('/platform')) return handlePlatform(db)
  if (path.includes('/setup-db')) return { needsSetup: false, tablesExist: true }
  if (path.includes('/setup/status') || path.includes('/setup')) {
    const users = await db.select('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL')
    return { needsSetup: users[0]?.count === 0 }
  }
  if (path.includes('/settings')) {
    const rows = await db.select('SELECT * FROM settings')
    const flat = rows.map((r: any) => ({ key: r.key, value: r.value, category: r.category }))
    const grouped: any = {}
    for (const s of flat) { if (!grouped[s.category]) grouped[s.category] = {}; grouped[s.category][s.key] = s.value }
    return { grouped, flat }
  }

  if (!schema) return []

  if (entityId) {
    // Single-entity lookup — apply deleted_at filter when the table has the column.
    const hasDeletedAt = schema.columns.includes('deleted_at')
    const rows = await db.select(
      hasDeletedAt
        ? `SELECT * FROM ${schema.table} WHERE id = ? AND deleted_at IS NULL LIMIT 1`
        : `SELECT * FROM ${schema.table} WHERE id = ? LIMIT 1`,
      [entityId]
    )
    const row = rows[0]
    if (!row) return null
    const camelRow = rowToCamel(row)
    if (tableName === 'products') {
      camelRow.currentStock = row.current_stock
      camelRow.stockLevels = [{ quantity: row.current_stock }]
    }
    if (tableName === 'sales') {
      const items = await db.select('SELECT * FROM sale_items WHERE sale_id = ? AND deleted_at IS NULL', [entityId])
      camelRow.items = items.map((i: any) => rowToCamel(i))
    }
    if (tableName === 'customers') {
      const acct = await db.select('SELECT * FROM loyalty_accounts WHERE customer_id = ? AND deleted_at IS NULL LIMIT 1', [entityId])
      camelRow.loyaltyAccount = acct[0] ? rowToCamel(acct[0]) : null
    }
    return camelRow
  }

  const url = new URL(`http://x${path}`)
  const search = url.searchParams.get('search')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000)
  let sql = `SELECT * FROM ${schema.table}`
  const args: any[] = []
  const hasDeletedAt = schema.columns.includes('deleted_at')
  const tablesWithActive = ['products', 'customers', 'suppliers']
  const hasActive = tablesWithActive.includes(tableName)

  // Build the WHERE clause from: search term, active flag (if applicable),
  // and deleted_at IS NULL (if the table has the column). Each filter is
  // appended with the correct AND / leading-WHERE connector.
  const whereParts: string[] = []
  if (search) {
    const searchFields = getSearchFields(tableName)
    if (searchFields.length > 0) {
      whereParts.push(`(${searchFields.map(f => `${f} LIKE ?`).join(' OR ')})`)
      const q = `%${search}%`
      searchFields.forEach(() => args.push(q))
    }
  }
  if (hasActive) whereParts.push("(active = 1 OR active = 'true')")
  if (hasDeletedAt) whereParts.push('deleted_at IS NULL')
  if (whereParts.length > 0) {
    sql += ' WHERE ' + whereParts.join(' AND ')
  }
  // Use string interpolation for LIMIT — safe because `limit` is a parsed integer
  sql += ` ORDER BY created_at DESC LIMIT ${limit}`

  // DEBUG: log the query and row count to diagnose empty results
  console.log(`[Desktop API] GET ${tableName}: SQL=${sql}, args=${JSON.stringify(args)}`)
  let rows = await db.select(sql, args)
  console.log(`[Desktop API] GET ${tableName}: returned ${rows.length} rows`)
  if (rows.length === 0) {
    // Try without filters to see if data exists at all
    const countRows = await db.select(`SELECT COUNT(*) as cnt FROM ${schema.table}`)
    console.log(`[Desktop API] GET ${tableName}: total rows in table (no filter): ${countRows[0]?.cnt || 0}`)
    if (countRows[0]?.cnt > 0) {
      const sampleRow = await db.select(`SELECT * FROM ${schema.table} LIMIT 1`)
      console.log(`[Desktop API] GET ${tableName}: sample row:`, JSON.stringify(sampleRow[0]))
    }
  }

  let results = rows.map(rowToCamel)

  if (tableName === 'products') {
    results = results.map((r: any) => {
      r.currentStock = r.currentStock ?? 0
      r.stockLevels = [{ quantity: r.currentStock }]
      return r
    })
  }
  if (tableName === 'customers') {
    for (const c of results) {
      const acct = await db.select('SELECT * FROM loyalty_accounts WHERE customer_id = ? AND deleted_at IS NULL LIMIT 1', [c.id])
      c.loyaltyAccount = acct[0] ? rowToCamel(acct[0]) : null
    }
  }
  if (tableName === 'sales') {
    for (const s of results) {
      const items = await db.select('SELECT * FROM sale_items WHERE sale_id = ? AND deleted_at IS NULL', [s.id])
      s.items = items.map((i: any) => rowToCamel(i))
    }
  }
  return results
}

function getSearchFields(tableName: string): string[] {
  switch (tableName) {
    case 'products': return ['name', 'name_ar', 'sku', 'barcode']
    case 'customers': return ['name', 'phone', 'email']
    case 'suppliers': return ['name', 'phone', 'email']
    default: return ['name']
  }
}

// ============================================================
// POST
// ============================================================
// Columns that are UNIQUE but not required. SQLite treats '' as a real,
// non-distinct value for UNIQUE — two rows both saved with '' collide and
// the second INSERT/UPDATE fails. NULL is always distinct from other NULLs,
// so blank optional fields must be stored as NULL, not ''.
const NULLABLE_UNIQUE_FIELDS = ['barcode', 'phone']
function normalizeNullableUnique(snakeBody: Record<string, any>) {
  for (const f of NULLABLE_UNIQUE_FIELDS) {
    if (snakeBody[f] === '') snakeBody[f] = null
  }
}

async function handlePost(db: any, tableName: string, path: string, options: RequestInit): Promise<any> {
  const body = JSON.parse(options.body as string)
  const schema = SCHEMA[tableName]

  if (path.includes('/auth/login')) return handleLogin(db, body)
  if (tableName === 'sales') return handleCreateSale(db, body)
  if (tableName === 'customers') return handleCreateCustomer(db, body)
  if (tableName === 'users') return handleCreateUser(db, body)
  if (tableName === 'purchases') return handleCreatePurchase(db, body)
  if (tableName === 'expenses') return handleCreateExpense(db, body)
  if (path.includes('/cash/open')) return handleCashOpen(db, body)
  if (path.includes('/cash/movement')) return handleCashMovement(db, body)
  if (path.includes('/cash/close')) return handleCashClose(db, body)
  if (path.includes('/inventory/adjust')) return handleInventoryAdjust(db, body)
  if (path.includes('/loyalty/redeem')) return handleLoyaltyRedeem(db, body)
  if (path.includes('/platform/lock')) return handlePlatformLock(db, body)
  if (path.includes('/setup') && !path.includes('/setup-db')) return handleSetup(db, body)
  if (path.includes('/refund')) return handleSaleRefund(db, path, body)

  if (!schema) throw new Error(`الجدول ${tableName} غير مدعوم`)
  const id = body.id || uuid()
  const snakeBody = objToSnake(body)

  // Map openingStock → current_stock for products
  if (tableName === 'products') {
    if (snakeBody.opening_stock !== undefined && snakeBody.current_stock === undefined) {
      snakeBody.current_stock = snakeBody.opening_stock
    }
    delete snakeBody.opening_stock
    // Set avg_cost from purchase_cost if not provided
    if (snakeBody.avg_cost === undefined && snakeBody.purchase_cost !== undefined) {
      snakeBody.avg_cost = snakeBody.purchase_cost
    }
  }

  if (!snakeBody.id) snakeBody.id = id
  normalizeNullableUnique(snakeBody)
  const columns = Object.keys(snakeBody).filter(k => schema.columns.includes(k))
  const values = columns.map(k => snakeBody[k])
  await upsert(db, schema.table, columns, values)
  await addToSyncQueue(db, tableName, id, body)
  const rows = await db.select(`SELECT * FROM ${schema.table} WHERE id = ?`, [id])
  return rowToCamel(rows[0])
}

// ============================================================
// PUT
// ============================================================
async function handlePut(db: any, tableName: string, entityId: string, options: RequestInit): Promise<any> {
  const body = JSON.parse(options.body as string)
  const schema = SCHEMA[tableName]
  if (!schema) throw new Error(`الجدول ${tableName} غير مدعوم`)

  // Special handlers for tables that don't fit the generic id-keyed UPDATE pattern.
  // - users: must hash body.password via bcrypt before touching password_hash.
  // - settings: uses `key` as PRIMARY KEY, not `id`; body may be a batch array.
  if (tableName === 'users') return handleUpdateUser(db, entityId, body)
  if (tableName === 'settings') return handlePutSettings(db, body)

  const snakeBody = objToSnake(body)
  normalizeNullableUnique(snakeBody)
  const columns = Object.keys(snakeBody).filter(k => schema.columns.includes(k) && k !== 'id')
  const values = columns.map(k => snakeBody[k])

  // Bump updated_at on every UPDATE so delta sync (WHERE updated_at > ?)
  // picks up the change. Only applies when the table actually has an
  // updated_at column (per schema.columns).
  const setClauses = columns.map(k => `${k} = ?`)
  if (schema.columns.includes('updated_at')) {
    setClauses.push("updated_at = datetime('now')")
  }

  if (setClauses.length === 0) {
    // Nothing to update — return the unchanged row.
    const noChangeRows = await db.select(`SELECT * FROM ${schema.table} WHERE id = ?`, [entityId])
    return rowToCamel(noChangeRows[0])
  }

  values.push(entityId)
  await db.execute(
    `UPDATE ${schema.table} SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  )
  await addToSyncQueue(db, tableName, entityId, body, 'UPDATE')
  const rows = await db.select(`SELECT * FROM ${schema.table} WHERE id = ?`, [entityId])
  return rowToCamel(rows[0])
}

// ============================================================
// DELETE
// ============================================================
async function handleDelete(db: any, tableName: string, entityId: string): Promise<any> {
  // Tables that have a `deleted_at` column (migration 002) → soft delete.
  // The row is marked deleted but kept for sync + historical reporting.
  // Per PHASE-1C spec, audit_logs is intentionally NOT soft-deleted
  // (audit logs are immutable historical records; hard-delete on demand).
  const SOFT_DELETE_TABLES = [
    'products', 'categories', 'customers', 'suppliers', 'users',
    'sales', 'sale_items', 'stock_movements', 'cash_sessions', 'cash_movements',
    'expenses', 'loyalty_accounts', 'loyalty_transactions', 'purchases',
    'purchase_items',
  ]
  // Subset of soft-delete tables that ALSO have an `active` column —
  // we toggle it to 0 so legacy `WHERE active = 1` queries keep working.
  const ACTIVE_TABLES = new Set(['products', 'customers', 'suppliers', 'users', 'loyalty_campaigns'])

  if (SOFT_DELETE_TABLES.includes(tableName)) {
    const setClause = ACTIVE_TABLES.has(tableName)
      ? "deleted_at = datetime('now'), active = 0"
      : "deleted_at = datetime('now')"
    await db.execute(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, [entityId])
  } else {
    // Tables without soft-delete (audit_logs, sync_queue, sync_metadata,
    // sale_payments, expense_categories, loyalty_tiers, etc.) — hard delete.
    await db.execute(`DELETE FROM ${tableName} WHERE id = ?`, [entityId])
  }
  await addToSyncQueue(db, tableName, entityId, {}, 'DELETE')
  return { id: entityId, deleted: true }
}

// ============================================================
// SPECIAL HANDLERS
// ============================================================

async function handleLogin(db: any, body: any): Promise<any> {
  const { username, password } = body
  if (!username || !password) throw new Error('ادخل اسم المستخدم وكلمة المرور')
  // users is soft-deletable (migration 002) — exclude tombstoned accounts.
  const rows = await db.select('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL LIMIT 1', [username])
  const user = rows[0]
  if (!user) throw new Error('اسم المستخدم غير موجود')
  if (!user.active) throw new Error('هذا الحساب معطل')
  const bcrypt = await import('bcryptjs')
  let valid = false
  try {
    valid = await bcrypt.compare(password, user.password_hash)
  } catch (e) {
    console.error('[Login] bcrypt error:', sqlErrorMsg(e))
  }
  if (!valid) throw new Error('كلمة المرور غير صحيحة')
  try {
    await db.execute(
      `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, created_at) VALUES (?, ?, 'LOGIN', 'User', ?, datetime('now'))`,
      [uuid(), user.id, user.id]
    )
  } catch {}

  // The local check above only proves the password is right — it does NOT
  // produce a token the real server will accept (that requires a signed
  // JWT from the server's own /api/auth/login, which knows the server's
  // signing secret). Every sync/pull and sync/push call needs a REAL
  // server token or the server correctly rejects it with 401 — which is
  // exactly what was happening before this fix (token was just user.id).
  // So: if we're online, also log in against the real server with the
  // same credentials and use ITS token for sync. If that fails (offline,
  // server down, or this account doesn't exist remotely yet), fall back
  // to a local placeholder — the app still works fully offline, sync just
  // stays paused until a login happens while online.
  let token: string = user.id
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await fetch(`${PRODUCTION_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success && data?.data?.token) {
        token = data.data.token
      } else {
        console.warn('[Login] Remote login failed, sync will stay paused until it succeeds:', data?.error || res.status)
      }
    } catch (e) {
      console.warn('[Login] Remote login unreachable, sync will stay paused until online:', sqlErrorMsg(e))
    }
  }

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: JSON.parse(user.permissions || '[]'),
      phone: user.phone,
      pin: user.pin,
    }
  }
}

// ============================================================
// CREATE SALE — multi-table atomic write wrapped in a single
// SQLite transaction so partial failures cannot leave stock,
// loyalty, or cash out of balance. Steps:
//   1. INSERT sales header
//   2. INSERT sale_items + decrement products.current_stock +
//      log stock_movements (type=SALE, client_txn_id for idempotency)
//   3. INSERT sale_payments row (migration 002 — multi-payment support)
//   4. Award loyalty points (account upsert + transaction log)
//   5. Record cash_movement for open cash session (CASH only)
//   6. Queue sale for server sync
// Any failure triggers ROLLBACK and the entire sale is aborted.
// ============================================================
async function handleCreateSale(db: any, body: any): Promise<any> {
  const { items, customerId, userId, discountAmount, taxAmount, total, paidAmount, paymentMethod, note, loyaltyRedeem } = body
  if (!items || items.length === 0) throw new Error('لا توجد أصناف')

  const saleId = uuid()
  const clientTxnId = body.clientTxnId || saleId
  const invoiceNumber = `LOCAL-${Date.now()}`
  const now = new Date().toISOString()

  // Pre-validate all products BEFORE opening the transaction — that way
  // a missing-product error throws cleanly without an aborted BEGIN.
  let subtotal = 0
  const itemsData: any[] = []
  for (const item of items) {
    const productRows = await db.select('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1', [item.productId])
    const product = productRows[0]
    if (!product) throw new Error('المنتج غير موجود')
    const lineTotal = product.selling_price * item.quantity
    const lineTax = lineTotal * (product.tax_rate / 100)
    subtotal += lineTotal + lineTax
    itemsData.push({
      productId: item.productId,
      productName: product.name_ar || product.name,
      quantity: item.quantity,
      unitPrice: product.selling_price,
      taxRate: product.tax_rate,
      total: lineTotal + lineTax,
      costAtSale: product.avg_cost,
    })
  }

  const finalTotal = total || subtotal
  const paid = paidAmount || finalTotal
  const change = Math.max(0, paid - finalTotal)
  const loyaltyEarned = customerId ? Math.floor(finalTotal / 10) : 0

  try {
    await db.execute('BEGIN')

    // 1. Sale header
    await db.execute(
      `INSERT INTO sales (id, client_txn_id, invoice_number, customer_id, user_id, items_json, subtotal, discount_amount, tax_amount, total, paid_amount, change_amount, payment_method, loyalty_earned, loyalty_redeemed, note, status, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', 'pending', ?, datetime('now'))`,
      [saleId, clientTxnId, invoiceNumber, customerId || null, userId, JSON.stringify(itemsData), subtotal, discountAmount || 0, taxAmount || 0, finalTotal, paid, change, paymentMethod || 'CASH', loyaltyEarned, loyaltyRedeem || 0, note || '', now]
    )

    // 2. Sale items + stock decrement + stock movement log
    for (const item of itemsData) {
      await db.execute(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total, cost_at_sale) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), saleId, item.productId, item.quantity, item.unitPrice, item.total, item.costAtSale]
      )
      await db.execute("UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now') WHERE id = ?", [item.quantity, item.productId])
      await db.execute(
        `INSERT INTO stock_movements (id, client_txn_id, product_id, type, quantity, ref_type, ref_id, note, sync_status, created_at)
         VALUES (?, ?, ?, 'SALE', ?, 'Sale', ?, ?, 'pending', ?)`,
        // Each stock movement gets a UNIQUE client_txn_id: saleTxnId + productId + ':STOCK'
        // This prevents UNIQUE constraint failure when a sale has multiple items
        // (each item generates its own stock movement with the same sale client_txn_id)
        [uuid(), `${clientTxnId}:${item.productId}:STOCK`, item.productId, -item.quantity, saleId, invoiceNumber, now]
      )
    }

    // 3. Payment record (sale_payments — migration 002)
    await db.execute(
      `INSERT INTO sale_payments (id, sale_id, method, amount, created_at, sync_status) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [uuid(), saleId, paymentMethod || 'CASH', paid, now]
    )

    // 4. Loyalty earn
    if (customerId && loyaltyEarned > 0) {
      await db.execute(
        `INSERT INTO loyalty_accounts (id, customer_id, points, total_earned, total_redeemed, tier, updated_at) VALUES (?, ?, ?, ?, 0, 'BRONZE', ?) ON CONFLICT(customer_id) DO UPDATE SET points = points + ?, total_earned = total_earned + ?, updated_at = ?`,
        [uuid(), customerId, loyaltyEarned, loyaltyEarned, now, loyaltyEarned, loyaltyEarned, now]
      )
      await db.execute(
        `INSERT INTO loyalty_transactions (id, client_txn_id, customer_id, type, points, ref_type, ref_id, note, sync_status, created_at) VALUES (?, ?, ?, 'EARN', ?, 'Sale', ?, ?, 'pending', ?)`,
        // Unique client_txn_id for loyalty: saleTxnId + ':LOYALTY'
        [uuid(), `${clientTxnId}:LOYALTY`, customerId, loyaltyEarned, saleId, `نقاط من ${invoiceNumber}`, now]
      )
    }

    // 5. Cash movement for open session (CASH only)
    if (paymentMethod === 'CASH') {
      const sessions = await db.select("SELECT * FROM cash_sessions WHERE status = 'OPEN' AND deleted_at IS NULL LIMIT 1")
      if (sessions[0]) {
        await db.execute(
          `INSERT INTO cash_movements (id, client_txn_id, session_id, type, amount, note, ref_type, ref_id, sync_status, created_at) VALUES (?, ?, ?, 'SALE', ?, ?, 'Sale', ?, 'pending', ?)`,
          // Unique client_txn_id for cash: saleTxnId + ':CASH'
          [uuid(), `${clientTxnId}:CASH`, sessions[0].id, finalTotal, invoiceNumber, saleId, now]
        )
      }
    }

    // 6. Sync queue entry
    await db.execute(
      `INSERT INTO sync_queue (entity_type, entity_id, client_txn_id, operation, payload, status, created_at) VALUES ('Sale', ?, ?, 'CREATE', ?, 'PENDING', datetime('now'))`,
      [saleId, clientTxnId, JSON.stringify({ ...body, clientTxnId, invoiceNumber })]
    )

    await db.execute('COMMIT')
  } catch (e: any) {
    await db.execute('ROLLBACK').catch(() => {})
    throw new Error(`فشل إنشاء البيع: ${sqlErrorMsg(e)}`)
  }

  return {
    id: saleId,
    clientTxnId,
    invoiceNumber,
    customerId,
    user: { name: 'الكاشير' },
    items: itemsData.map(i => ({ product: { nameAr: i.productName, name: i.productName }, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })),
    subtotal,
    discountAmount: discountAmount || 0,
    taxAmount: taxAmount || 0,
    total: finalTotal,
    paidAmount: paid,
    changeAmount: change,
    paymentMethod: paymentMethod || 'CASH',
    loyaltyEarned,
    createdAt: now,
  }
}

async function handleCreateCustomer(db: any, body: any): Promise<any> {
  const id = uuid()
  const { name, phone, email, address, tier } = body
  if (phone) {
    // customers is soft-deletable — only consider live rows for the duplicate check.
    const existing = await db.select('SELECT * FROM customers WHERE phone = ? AND deleted_at IS NULL LIMIT 1', [phone])
    if (existing[0]) return rowToCamel(existing[0])
  }
  await db.execute(
    `INSERT INTO customers (id, name, phone, email, address, tier, active, loyalty_points, total_earned, total_redeemed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0, datetime('now'), datetime('now'))`,
    [id, name, phone || null, email || null, address || null, tier || 'BRONZE']
  )
  await db.execute(
    `INSERT INTO loyalty_accounts (id, customer_id, points, total_earned, total_redeemed, tier, updated_at) VALUES (?, ?, 0, 0, 0, ?, datetime('now'))`,
    [uuid(), id, tier || 'BRONZE']
  )
  await addToSyncQueue(db, 'customers', id, body)
  const rows = await db.select('SELECT * FROM customers WHERE id = ?', [id])
  const customer = rowToCamel(rows[0])
  customer.loyaltyAccount = { points: 0, totalEarned: 0, totalRedeemed: 0, tier: tier || 'BRONZE' }
  return customer
}

// ============================================================
// CREATE EXPENSE — wraps the insert + cash_movement + audit_log
// in a single SQLite transaction so partial failures cannot leave
// the books out of balance. Adds client_txn_id (migration 002)
// for sync-push idempotency. CASH expenses also record an EXPENSE
// movement on the currently-open cash session so the expected-cash
// calculation stays accurate.
// ============================================================
async function handleCreateExpense(db: any, body: any): Promise<any> {
  const id = body.id || uuid()
  const clientTxnId = body.clientTxnId || id
  const { categoryId, userId, amount, paymentMethod, note, date } = body

  if (!amount || amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر')
  if (!userId) throw new Error('المستخدم مطلوب')

  const method = paymentMethod || 'CASH'
  const now = date || new Date().toISOString()

  try {
    await db.execute('BEGIN')

    // 1. Expense record (with idempotency key from migration 002)
    await db.execute(
      `INSERT INTO expenses (id, client_txn_id, category_id, user_id, amount, payment_method, note, date, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
      [id, clientTxnId, categoryId || null, userId, amount, method, note || '', now]
    )

    // 2. Cash movement for CASH expenses (deducts from open session)
    if (method === 'CASH') {
      const sessions = await db.select("SELECT id FROM cash_sessions WHERE status = 'OPEN' AND deleted_at IS NULL ORDER BY opened_at DESC LIMIT 1")
      if (sessions[0]) {
        await db.execute(
          `INSERT INTO cash_movements (id, client_txn_id, session_id, type, amount, note, ref_type, ref_id, sync_status, created_at)
           VALUES (?, ?, ?, 'EXPENSE', ?, ?, 'Expense', ?, 'pending', datetime('now'))`,
          [uuid(), clientTxnId, sessions[0].id, amount, note || 'مصروف نقدي', id]
        )
      }
    }

    // 3. Audit log entry
    try {
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, after, created_at)
         VALUES (?, ?, 'CREATE_EXPENSE', 'Expense', ?, ?, datetime('now'))`,
        [uuid(), userId, id, JSON.stringify({ amount, method, categoryId, note })]
      )
    } catch {}

    await db.execute('COMMIT')
  } catch (e: any) {
    await db.execute('ROLLBACK').catch(() => {})
    throw new Error(`فشل إنشاء المصروف: ${sqlErrorMsg(e)}`)
  }

  await addToSyncQueue(db, 'expenses', id, { ...body, clientTxnId })
  return { id, clientTxnId, ...body }
}

// ============================================================
// CASH OPEN — atomically close any already-open session then open
// a new one with an OPENING cash_movement. Wrapped in BEGIN/COMMIT
// so a crash mid-way cannot leave two OPEN sessions or a missing
// opening movement.
// ============================================================
async function handleCashOpen(db: any, body: any): Promise<any> {
  const id = uuid()
  const clientTxnId = body.clientTxnId || id
  const { userId, openingBalance } = body

  try {
    await db.execute('BEGIN')

    // 1. Auto-close any previously-open session
    await db.execute("UPDATE cash_sessions SET status = 'CLOSED', closed_at = datetime('now'), updated_at = datetime('now') WHERE status = 'OPEN'")

    // 2. Open new session
    await db.execute(
      `INSERT INTO cash_sessions (id, user_id, opening_balance, status, opened_at, updated_at)
       VALUES (?, ?, ?, 'OPEN', datetime('now'), datetime('now'))`,
      [id, userId, openingBalance || 0]
    )

    // 3. Record the OPENING movement so expected-cash math includes it
    await db.execute(
      `INSERT INTO cash_movements (id, session_id, type, amount, note, ref_type, ref_id, sync_status, created_at)
       VALUES (?, ?, 'OPENING', ?, 'افتتاح الكاش', 'CashSession', ?, 'pending', datetime('now'))`,
      [uuid(), id, openingBalance || 0, id]
    )

    await db.execute('COMMIT')
  } catch (e: any) {
    await db.execute('ROLLBACK').catch(() => {})
    throw new Error(`فشل فتح الكاش: ${sqlErrorMsg(e)}`)
  }

  await addToSyncQueue(db, 'cash_sessions', id, { ...body, clientTxnId })
  return { id, clientTxnId, ...body, status: 'OPEN' }
}

async function handleCashMovement(db: any, body: any): Promise<any> {
  const id = uuid()
  const { sessionId, type, amount, note } = body
  await db.execute(
    `INSERT INTO cash_movements (id, session_id, type, amount, note, sync_status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    [id, sessionId, type, amount, note || '']
  )
  await addToSyncQueue(db, 'cash_movements', id, body)
  return { id, ...body }
}

// ============================================================
// CASH CLOSE — computes expected vs actual cash, marks the session
// CLOSED, and records a CLOSING movement + audit entry. The reads
// (session + movements) happen BEFORE BEGIN so validation errors
// propagate cleanly without an aborted transaction.
// ============================================================
async function handleCashClose(db: any, body: any): Promise<any> {
  const { sessionId, actualCash, userId } = body

  const sessions = await db.select('SELECT * FROM cash_sessions WHERE id = ? AND deleted_at IS NULL', [sessionId])
  const session = sessions[0]
  if (!session) throw new Error('الجلسة غير موجودة')
  const movements = await db.select('SELECT * FROM cash_movements WHERE session_id = ? AND deleted_at IS NULL', [sessionId])
  const expected = session.opening_balance + movements.reduce((s: number, m: any) => s + m.amount, 0)
  const difference = (actualCash || 0) - expected

  try {
    await db.execute('BEGIN')

    await db.execute(
      `UPDATE cash_sessions SET closing_balance = ?, expected_cash = ?, difference = ?, status = 'CLOSED', closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [actualCash, expected, difference, sessionId]
    )

    // CLOSING movement so the session's movement history is complete
    await db.execute(
      `INSERT INTO cash_movements (id, session_id, type, amount, note, ref_type, ref_id, sync_status, created_at)
       VALUES (?, ?, 'CLOSING', ?, 'إغلاق الكاش', 'CashSession', ?, 'pending', datetime('now'))`,
      [uuid(), sessionId, actualCash || 0, sessionId]
    )

    // Audit log
    try {
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, after, created_at)
         VALUES (?, ?, 'CLOSE_CASH', 'CashSession', ?, ?, datetime('now'))`,
        [uuid(), userId || null, sessionId, JSON.stringify({ expected, actualCash, difference })]
      )
    } catch {}

    await db.execute('COMMIT')
  } catch (e: any) {
    await db.execute('ROLLBACK').catch(() => {})
    throw new Error(`فشل إغلاق الكاش: ${sqlErrorMsg(e)}`)
  }

  return { sessionId, expectedCash: expected, actualCash, difference }
}

async function handleInventoryAdjust(db: any, body: any): Promise<any> {
  const { productId, newQuantity, reason } = body
  const products = await db.select('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL', [productId])
  const product = products[0]
  if (!product) throw new Error('المنتج غير موجود')
  const oldQty = product.current_stock
  const diff = newQuantity - oldQty
  await db.execute('UPDATE products SET current_stock = ? WHERE id = ?', [newQuantity, productId])
  await db.execute(
    `INSERT INTO stock_movements (id, product_id, type, quantity, note, sync_status, created_at) VALUES (?, ?, 'ADJUSTMENT', ?, ?, 'pending', datetime('now'))`,
    [uuid(), productId, diff, reason || 'تسوية مخزون']
  )
  return { productId, oldQuantity: oldQty, newQuantity }
}

// ============================================================
// LOYALTY REDEEM — deduct points from customer's loyalty account
// ============================================================
async function handleLoyaltyRedeem(db: any, body: any): Promise<any> {
  const { customerId, points, note } = body
  if (!customerId) throw new Error('العميل مطلوب')
  if (!points || points <= 0) throw new Error('النقاط يجب أن تكون أكبر من صفر')

  // loyalty_accounts is soft-deletable — exclude tombstoned accounts.
  const accounts = await db.select('SELECT * FROM loyalty_accounts WHERE customer_id = ? AND deleted_at IS NULL LIMIT 1', [customerId])
  const account = accounts[0]
  if (!account) throw new Error('حساب الولاء غير موجود')
  if (account.points < points) {
    throw new Error(`الرصيد غير كافي. المتاح: ${account.points} نقطة`)
  }

  const newPoints = account.points - points
  const newRedeemed = account.total_redeemed + points
  await db.execute(
    'UPDATE loyalty_accounts SET points = ?, total_redeemed = ?, updated_at = datetime(\'now\') WHERE customer_id = ?',
    [newPoints, newRedeemed, customerId]
  )
  await db.execute(
    `INSERT INTO loyalty_transactions (id, customer_id, type, points, note, sync_status, created_at) VALUES (?, ?, 'REDEEM', ?, ?, 'pending', datetime('now'))`,
    [uuid(), customerId, -points, note || 'استبدال نقاط']
  )

  return {
    account: { ...rowToCamel(account), points: newPoints, totalRedeemed: newRedeemed },
    transaction: { customerId, type: 'REDEEM', points: -points, note: note || 'استبدال نقاط' },
  }
}

// ============================================================
// PLATFORM LOCK — lock/unlock the system
// ============================================================
async function handlePlatformLock(db: any, body: any): Promise<any> {
  const { locked, reason, userId } = body
  await db.execute('INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', ['system.locked', locked ? 'true' : 'false', 'system'])
  await db.execute('INSERT OR REPLACE INTO settings (key, value, category) VALUES (?, ?, ?)', ['system.lockedReason', reason || '', 'system'])
  try {
    await db.execute(
      `INSERT INTO audit_logs (id, user_id, action, entity, after, created_at) VALUES (?, ?, ?, 'System', ?, datetime('now'))`,
      [uuid(), userId || null, locked ? 'SYSTEM_LOCKED' : 'SYSTEM_UNLOCKED', JSON.stringify({ locked, reason })]
    )
  } catch {}
  return { locked, reason: reason || '' }
}

// ============================================================
// SETUP — initial system setup (already done by seedAdminUser in desktop)
// ============================================================
async function handleSetup(db: any, body: any): Promise<any> {
  // In desktop mode, seedAdminUser already runs on first launch.
  // Just check if admin exists and return appropriate response.
  const users = await db.select('SELECT COUNT(*) as count FROM users')
  if (users[0]?.count > 0) {
    return { alreadySetup: true, message: 'النظام تم إعداده بالفعل' }
  }
  // If no users, force seed
  await seedAdminUser(db)
  return { success: true, message: 'تم إعداد النظام بنجاح' }
}

// ============================================================
// SALE REFUND — multi-table atomic write that creates the
// sale_return + sale_return_items, restores stock, logs RETURN
// stock_movements, reverses loyalty points, updates sale status,
// and queues for sync. All writes wrapped in BEGIN/COMMIT/ROLLBACK
// so a partial failure cannot leave stock restored but the sale
// unmarked, or vice versa.
// ============================================================
async function handleSaleRefund(db: any, path: string, body: any): Promise<any> {
  // Extract sale ID from path: /sales/{id}/refund
  const pathParts = path.split('/').filter(Boolean)
  const saleId = pathParts[1] // ['sales', '{id}', 'refund']
  if (!saleId) throw new Error('معرف الفاتورة مطلوب')

  const { items, reason, refundMethod, userId } = body

  // Pre-validation reads (before BEGIN) so user-facing errors throw cleanly.
  const sales = await db.select('SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL LIMIT 1', [saleId])
  const sale = sales[0]
  if (!sale) throw new Error('الفاتورة غير موجودة')
  if (sale.status === 'REFUNDED') throw new Error('الفاتورة مستردة بالكامل')

  const saleItems = await db.select('SELECT * FROM sale_items WHERE sale_id = ? AND deleted_at IS NULL', [saleId])

  let refundTotal = 0
  let loyaltyReversed = 0
  const returnItems: any[] = []

  for (const ret of items) {
    const saleItem = saleItems.find((si: any) => si.id === ret.saleItemId)
    if (!saleItem) throw new Error('صنف غير موجود في الفاتورة')
    if (ret.quantity > saleItem.quantity) throw new Error('كمية الإرجاع أكبر من المباعة')
    const lineTotal = (saleItem.total / saleItem.quantity) * ret.quantity
    refundTotal += lineTotal
    returnItems.push({
      id: uuid(),
      saleItemId: saleItem.id,
      productId: saleItem.product_id,
      quantity: ret.quantity,
      unitPrice: saleItem.unit_price,
      total: lineTotal,
    })
  }

  if (sale.loyalty_earned > 0 && sale.customer_id) {
    loyaltyReversed = Math.floor(sale.loyalty_earned * (refundTotal / sale.total))
  }

  const returnId = uuid()
  const clientTxnId = body.clientTxnId || returnId
  const returnNumber = `RET-${Date.now()}`

  try {
    await db.execute('BEGIN')

    // 1. Sale return header (with idempotency key from migration 002)
    await db.execute(
      `INSERT INTO sale_returns (id, client_txn_id, return_number, sale_id, user_id, subtotal, tax_amount, total, refund_method, reason, status, loyalty_reversed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'COMPLETED', ?, datetime('now'))`,
      [returnId, clientTxnId, returnNumber, saleId, userId, refundTotal, refundTotal, refundMethod || 'CASH', reason || 'إرجاع', loyaltyReversed]
    )

    // 2. Return items + restore stock + log RETURN movement
    for (const ret of returnItems) {
      await db.execute(
        `INSERT INTO sale_return_items (id, sale_return_id, sale_item_id, product_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ret.id, returnId, ret.saleItemId, ret.productId, ret.quantity, ret.unitPrice, ret.total]
      )
      await db.execute("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?", [ret.quantity, ret.productId])
      await db.execute(
        `INSERT INTO stock_movements (id, client_txn_id, product_id, type, quantity, ref_type, ref_id, note, sync_status, created_at)
         VALUES (?, ?, ?, 'RETURN', ?, 'SaleReturn', ?, ?, 'pending', datetime('now'))`,
        [uuid(), `${clientTxnId}:${ret.productId}:STOCK`, ret.productId, ret.quantity, returnId, `إرجاع - ${returnNumber}`]
      )
    }

    // 3. Reverse loyalty points
    if (loyaltyReversed > 0 && sale.customer_id) {
      await db.execute(
        "UPDATE loyalty_accounts SET points = MAX(0, points - ?), updated_at = datetime('now') WHERE customer_id = ?",
        [loyaltyReversed, sale.customer_id]
      )
      await db.execute(
        `INSERT INTO loyalty_transactions (id, client_txn_id, customer_id, type, points, ref_type, ref_id, note, sync_status, created_at)
         VALUES (?, ?, ?, 'REVERSE', ?, 'SaleReturn', ?, ?, 'pending', datetime('now'))`,
        [uuid(), clientTxnId, sale.customer_id, -loyaltyReversed, returnId, `عكس نقاط - ${returnNumber}`]
      )
    }

    // 4. Mark sale as partially refunded
    await db.execute("UPDATE sales SET status = ?, updated_at = datetime('now') WHERE id = ?", ['PARTIAL_REFUND', saleId])

    // 5. Queue for sync
    await db.execute(
      `INSERT INTO sync_queue (entity_type, entity_id, client_txn_id, operation, payload, status, created_at) VALUES ('SaleReturn', ?, ?, 'CREATE', ?, 'PENDING', datetime('now'))`,
      [returnId, clientTxnId, JSON.stringify({ saleId, items, reason, refundMethod, userId })]
    )

    await db.execute('COMMIT')
  } catch (e: any) {
    await db.execute('ROLLBACK').catch(() => {})
    throw new Error(`فشل إرجاع الفاتورة: ${sqlErrorMsg(e)}`)
  }

  return {
    id: returnId,
    returnNumber,
    saleId,
    refundTotal,
    loyaltyReversed,
    items: returnItems,
  }
}

// ============================================================
// CREATE USER — special handler because users.password must be
// hashed with bcrypt before being stored as password_hash. The
// generic handlePost would store the raw password and break login.
// Also enforces username uniqueness and seeds permissions based
// on role when not explicitly provided. NEVER pushes the plaintext
// password to the sync queue — only the hashed password_hash is
// stored locally and the sync payload strips `password`.
// ============================================================
async function handleCreateUser(db: any, body: any): Promise<any> {
  const id = body.id || uuid()
  const { name, username, email, phone, role, pin, active, password } = body
  if (!username) throw new Error('اسم المستخدم مطلوب')
  if (!password) throw new Error('كلمة المرور مطلوبة')

  // Check username uniqueness — exclude soft-deleted rows.
  const existing = await db.select('SELECT id FROM users WHERE username = ? AND deleted_at IS NULL LIMIT 1', [username])
  if (existing[0]) throw new Error('اسم المستخدم موجود بالفعل')

  const bcrypt = await import('bcryptjs')
  const passwordHash = await bcrypt.hash(password, 10)
  const permissions = body.permissions || (role === 'ADMIN' ? ['all'] : [])

  await db.execute(
    `INSERT INTO users (id, email, username, password_hash, name, phone, role, permissions, active, pin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, email || `${username}@local`, username, passwordHash, name || username, phone || null, role || 'CASHIER', JSON.stringify(permissions), active !== false ? 1 : 0, pin || null]
  )
  // Don't send plaintext password to sync queue (security)
  await addToSyncQueue(db, 'users', id, { ...body, password: undefined })
  const rows = await db.select('SELECT id, email, username, name, phone, role, permissions, active, pin, created_at FROM users WHERE id = ?', [id])
  const user = rowToCamel(rows[0])
  user.permissions = JSON.parse(user.permissions || '[]')
  return user
}

// ============================================================
// UPDATE USER — special handler so we never accidentally write
// plaintext passwords to password_hash. If body.password is
// present we re-hash with bcrypt; otherwise the existing hash is
// left untouched. Other updatable fields: name, email, phone,
// role, permissions, active, pin. Always bumps updated_at so
// delta sync picks up the change.
// ============================================================
async function handleUpdateUser(db: any, entityId: string, body: any): Promise<any> {
  const { name, email, phone, role, permissions, active, pin, password } = body

  const cols: string[] = []
  const vals: any[] = []

  if (name !== undefined) { cols.push('name = ?'); vals.push(name) }
  if (email !== undefined) { cols.push('email = ?'); vals.push(email) }
  if (phone !== undefined) { cols.push('phone = ?'); vals.push(phone) }
  if (role !== undefined) { cols.push('role = ?'); vals.push(role) }
  if (permissions !== undefined) { cols.push('permissions = ?'); vals.push(JSON.stringify(permissions)) }
  if (active !== undefined) { cols.push('active = ?'); vals.push(active ? 1 : 0) }
  if (pin !== undefined) { cols.push('pin = ?'); vals.push(pin) }

  if (password) {
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash(password, 10)
    cols.push('password_hash = ?')
    vals.push(passwordHash)
  }

  if (cols.length === 0) {
    // Nothing to update — return the existing row.
    const emptyRows = await db.select('SELECT id, email, username, name, phone, role, permissions, active, pin FROM users WHERE id = ?', [entityId])
    const emptyUser = rowToCamel(emptyRows[0])
    if (emptyUser) emptyUser.permissions = JSON.parse(emptyUser.permissions || '[]')
    return emptyUser
  }

  cols.push("updated_at = datetime('now')")
  vals.push(entityId)

  await db.execute(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`, vals)
  // Don't push plaintext password to sync queue
  await addToSyncQueue(db, 'users', entityId, { ...body, password: undefined }, 'UPDATE')

  const rows = await db.select('SELECT id, email, username, name, phone, role, permissions, active, pin FROM users WHERE id = ?', [entityId])
  const user = rowToCamel(rows[0])
  if (user) user.permissions = JSON.parse(user.permissions || '[]')
  return user
}

// ============================================================
// PUT SETTINGS — settings uses `key` as PRIMARY KEY (not `id`),
// so the generic handlePut (`WHERE id = ?`) cannot update it.
// Body can be either:
//   - { settings: [{key, value, category}, ...] }  (batch from settings.tsx)
//   - { key, value, category }                      (single)
// Uses INSERT OR REPLACE so missing settings get created and
// existing ones updated in place. Each row also bumps updated_at
// for delta-sync support.
// ============================================================
async function handlePutSettings(db: any, body: any): Promise<any> {
  const items: Array<{ key: string, value: any, category?: string }> =
    Array.isArray(body.settings) ? body.settings : [body]

  for (const item of items) {
    if (!item.key) continue
    await db.execute(
      `INSERT OR REPLACE INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, datetime('now'))`,
      [item.key, String(item.value ?? ''), item.category || 'general']
    )
  }
  return { saved: items.length, keys: items.map(i => i.key) }
}

// ============================================================
// CREATE PURCHASE — multi-table atomic write that creates the
// purchase header, all purchase_items, increments stock on hand,
// recalculates weighted-average cost, logs a PURCHASE
// stock_movement per line, updates the supplier's running balance
// when the purchase is on account, and queues the whole thing for
// sync. All steps wrapped in BEGIN/COMMIT/ROLLBACK so a failure
// mid-way cannot leave stock or balances half-updated.
// ============================================================
async function handleCreatePurchase(db: any, body: any): Promise<any> {
  const id = body.id || uuid()
  const clientTxnId = body.clientTxnId || id
  const { invoiceNumber, supplierId, userId, warehouseId, items, subtotal, taxAmount, discountAmount, total, paidAmount, status, note } = body

  if (!items || items.length === 0) throw new Error('لا توجد أصناف في الفاتورة')

  const purchaseStatus = status || 'RECEIVED'
  const now = new Date().toISOString()
  const finalSubtotal = subtotal ?? items.reduce((s: number, i: any) => s + (i.quantity * i.unitCost), 0)
  const finalTotal = total ?? finalSubtotal
  const finalPaid = paidAmount ?? finalTotal
  const invNo = invoiceNumber || `PUR-${Date.now()}`

  try {
    await db.execute('BEGIN')

    // 1. Purchase header (with idempotency key from migration 002)
    await db.execute(
      `INSERT INTO purchases (id, client_txn_id, invoice_number, supplier_id, user_id, warehouse_id, subtotal, tax_amount, discount_amount, total, paid_amount, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, clientTxnId, invNo, supplierId || null, userId || null, warehouseId || null, finalSubtotal, taxAmount || 0, discountAmount || 0, finalTotal, finalPaid, purchaseStatus, note || '']
    )

    // 2. Purchase items + stock update + weighted-avg cost + movement log
    for (const item of items) {
      const itemId = uuid()
      const lineTotal = item.quantity * item.unitCost
      await db.execute(
        `INSERT INTO purchase_items (id, purchase_id, product_id, quantity, unit_cost, tax_rate, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [itemId, id, item.productId, item.quantity, item.unitCost, item.taxRate || 0, lineTotal]
      )

      // Look up current stock + avg_cost to compute the new weighted average
      const productRows = await db.select('SELECT current_stock, avg_cost FROM products WHERE id = ? AND deleted_at IS NULL', [item.productId])
      const product = productRows[0]
      if (product) {
        const oldQty = product.current_stock || 0
        const oldCost = product.avg_cost || 0
        const newQty = oldQty + item.quantity
        // Weighted average: (old_qty * old_cost + new_qty * new_cost) / total_qty
        const newAvg = newQty > 0 ? ((oldQty * oldCost) + (item.quantity * item.unitCost)) / newQty : item.unitCost

        await db.execute(
          "UPDATE products SET current_stock = ?, avg_cost = ?, updated_at = datetime('now') WHERE id = ?",
          [newQty, newAvg, item.productId]
        )

        await db.execute(
          `INSERT INTO stock_movements (id, client_txn_id, product_id, type, quantity, ref_type, ref_id, note, sync_status, created_at)
           VALUES (?, ?, ?, 'PURCHASE', ?, 'Purchase', ?, ?, 'pending', datetime('now'))`,
          [uuid(), `${clientTxnId}:${item.productId}:STOCK`, item.productId, item.quantity, id, `شراء - ${invNo}`]
        )
      }
    }

    // 3. If on account (paid < total), increase supplier balance by the unpaid portion
    if (supplierId && finalPaid < finalTotal) {
      const unpaid = finalTotal - finalPaid
      await db.execute(
        "UPDATE suppliers SET balance = COALESCE(balance, 0) + ?, updated_at = datetime('now') WHERE id = ?",
        [unpaid, supplierId]
      )
    }

    await db.execute('COMMIT')
  } catch (e: any) {
    await db.execute('ROLLBACK').catch(() => {})
    throw new Error(`فشل إنشاء الفاتورة: ${sqlErrorMsg(e)}`)
  }

  await addToSyncQueue(db, 'purchases', id, { ...body, clientTxnId })
  return { id, clientTxnId, ...body }
}

async function handleCash(db: any, path: string): Promise<any> {
  // cash_sessions + cash_movements both carry deleted_at (migration 002).
  const sessions = await db.select("SELECT * FROM cash_sessions WHERE status = 'OPEN' AND deleted_at IS NULL ORDER BY opened_at DESC LIMIT 1")
  if (sessions.length === 0) return null
  const session = rowToCamel(sessions[0])
  const movements = await db.select('SELECT * FROM cash_movements WHERE session_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', [sessions[0].id])
  session.movements = movements.map(rowToCamel)
  const totalSales = movements.filter((m: any) => m.type === 'SALE').reduce((s: number, m: any) => s + m.amount, 0)
  const totalIn = movements.filter((m: any) => m.type === 'CASH_IN').reduce((s: number, m: any) => s + m.amount, 0)
  const totalOut = movements.filter((m: any) => m.type === 'CASH_OUT').reduce((s: number, m: any) => s + m.amount, 0)
  const totalExpenses = movements.filter((m: any) => m.type === 'EXPENSE').reduce((s: number, m: any) => s + m.amount, 0)
  session.expectedCash = session.openingBalance + totalSales + totalIn - totalOut - totalExpenses
  return session
}

async function handleDashboard(db: any): Promise<any> {
  const [todaySales, products, customers, lowStock, outOfStock, pendingSync] = await Promise.all([
    // sales is soft-deletable — filter deleted_at IS NULL.
    db.select("SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM sales WHERE date(created_at) = date('now') AND deleted_at IS NULL"),
    db.select('SELECT COUNT(*) as count FROM products WHERE active = 1 AND deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM customers WHERE active = 1 AND deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM products WHERE current_stock <= reorder_level AND current_stock > 0 AND active = 1 AND deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM products WHERE current_stock <= 0 AND active = 1 AND deleted_at IS NULL'),
    // sync_queue has no deleted_at column.
    db.select("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING'"),
  ])
  const inventoryValue = await db.select('SELECT COALESCE(SUM(current_stock * avg_cost), 0) as value FROM products WHERE active = 1 AND deleted_at IS NULL')
  return {
    todaySales: todaySales[0]?.total || 0,
    todayCount: todaySales[0]?.count || 0,
    avgOrderValue: todaySales[0]?.count > 0 ? todaySales[0].total / todaySales[0].count : 0,
    totalProducts: products[0]?.count || 0,
    totalCustomers: customers[0]?.count || 0,
    lowStockCount: lowStock[0]?.count || 0,
    outOfStockCount: outOfStock[0]?.count || 0,
    inventoryValue: inventoryValue[0]?.value || 0,
    pendingSync: pendingSync[0]?.count || 0,
    topProducts: [],
    salesByDay: [],
    salesByCategory: [],
    salesByPaymentMethod: [],
    insights: [{ type: 'info', message: `وضع الديسكتوب - ${pendingSync[0]?.count || 0} عملية بانتظار المزامنة` }],
  }
}

async function handleInventory(db: any, path: string): Promise<any> {
  // products is soft-deletable — filter deleted_at IS NULL alongside active = 1.
  const products = await db.select('SELECT p.*, c.name as category_name, c.name_ar as category_name_ar FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1 AND p.deleted_at IS NULL ORDER BY p.name')
  const mapped = products.map((p: any) => ({
    ...rowToCamel(p),
    categoryName: p.category_name,
    categoryNameAr: p.category_name_ar,
    currentStock: p.current_stock,
    stockValue: p.current_stock * p.avg_cost,
    status: p.current_stock <= 0 ? 'out_of_stock' : p.current_stock <= p.reorder_level ? 'low_stock' : 'in_stock',
  }))
  const totalStockValue = mapped.reduce((s: number, p: any) => s + (p.stockValue || 0), 0)
  const lowStockCount = mapped.filter((p: any) => p.currentStock > 0 && p.currentStock <= p.reorderLevel).length
  const outOfStockCount = mapped.filter((p: any) => p.currentStock <= 0).length
  return {
    products: mapped,
    summary: { totalStockValue, totalProducts: mapped.length, lowStockCount, outOfStockCount },
  }
}

async function handlePlatform(db: any): Promise<any> {
  // All counted tables (products, customers, sales, users, expenses,
  // stock_movements) carry a deleted_at column from migration 002 —
  // filter them out so platform stats reflect live rows only.
  // audit_logs and sync_queue have no deleted_at (audit_logs is
  // hard-deleted per PHASE-1C spec) — no filter applied there.
  const [products, customers, sales, users, expenses, stockMovements, auditLogs, pendingSync] = await Promise.all([
    db.select('SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM customers WHERE deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM sales WHERE deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM expenses WHERE deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM stock_movements WHERE deleted_at IS NULL'),
    db.select('SELECT COUNT(*) as count FROM audit_logs'),
    db.select("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING'"),
  ])
  return {
    systemLocked: false,
    database: {
      totalRecords: products[0].count + customers[0].count + sales[0].count + users[0].count,
      tables: {
        products: products[0].count,
        customers: customers[0].count,
        sales: sales[0].count,
        users: users[0].count,
        expenses: expenses[0].count,
        stockMovements: stockMovements[0].count,
        auditLogs: auditLogs[0].count,
        pendingSync: pendingSync[0].count,
      },
    },
  }
}

async function addToSyncQueue(db: any, entityType: string, entityId: string, payload: any, operation: string = 'CREATE') {
  const clientTxnId = payload.clientTxnId || entityId
  const deviceId = getDeviceId()
  // INSERT OR REPLACE keyed on the unique partial index
  // `uq_sync_queue_client_txn` (created by patchSchema) — when the
  // same clientTxnId is re-queued (e.g. user re-saves the same
  // entity), the older PENDING row is replaced instead of producing
  // duplicate sync operations. The new row also carries device_id
  // (migration 002) so the server can attribute the operation to
  // this device, and bumps updated_at for delta sync visibility.
  //
  // If the unique index doesn't exist for some reason (e.g. an
  // older binary that hasn't run patchSchema yet), INSERT OR REPLACE
  // falls back to plain INSERT semantics (no conflict target) and
  // the row is added normally — the operation will still sync, just
  // without dedup. patchSchema runs on every getDb() so this case
  // is rare and self-healing on the next launch.
  await db.execute(
    `INSERT OR REPLACE INTO sync_queue
      (entity_type, entity_id, client_txn_id, device_id, operation, payload, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, datetime('now'), datetime('now'))`,
    [entityType, entityId, clientTxnId, deviceId, operation, JSON.stringify(payload)]
  )
}

// ============================================================
// REAL DESKTOP SYNC — talks to the actual SQLite DB (pos.db)
// and the real server via an ABSOLUTE url.
//
// NOTE: sync-engine.ts (Dexie/IndexedDB + relative /api/... fetch)
// is for the Next.js WEB app's offline mode only. Inside the Tauri
// webview there is no Next.js server, so relative /api/... fetches
// never resolve, and Dexie is a different database than pos.db —
// so that engine cannot pull/push data for the desktop app. This
// is the real implementation for the desktop app.
// ============================================================

// ============================================================
// DEVICE ID — stable per-device identifier persisted in localStorage.
// Used as the device_id column on sync_queue rows and the deviceId
// field in the /api/sync/push body, plus the device_id key on every
// sync_metadata cursor row. Generated once on first use, then
// cached in module scope + localStorage.
// ============================================================
let _deviceId: string | null = null
function getDeviceId(): string {
  if (_deviceId) return _deviceId
  if (typeof localStorage !== 'undefined') {
    _deviceId = localStorage.getItem('pos_device_id')
    if (!_deviceId) {
      _deviceId = uuid()
      localStorage.setItem('pos_device_id', _deviceId)
    }
    return _deviceId
  }
  return 'desktop-unknown'
}

// ============================================================
// SERVER ENTITY TYPE MAP
// ------------------------------------------------------------
// The desktop sync_queue stores entity_type in mixed forms
// (e.g. 'Sale' from handleCreateSale, 'customers' from
// handleCreateCustomer, 'cash_sessions' from handleCashOpen).
// The /api/sync/push server expects PascalCase singular names
// ('Sale', 'Customer', 'CashSession'). This map normalizes the
// value before sending it to the server. Unmapped types
// ('users', 'SaleReturn') pass through and the server returns
// a per-operation error of "نوع كيان غير مدعوم" — those rows
// stay PENDING with attempts incremented, eventually ageing
// out via the `attempts < 5` filter on the SELECT.
// ============================================================
const SERVER_ENTITY_MAP: Record<string, string> = {
  'Sale': 'Sale',
  'sales': 'Sale',
  'Customer': 'Customer',
  'customers': 'Customer',
  'Product': 'Product',
  'products': 'Product',
  'Expense': 'Expense',
  'expenses': 'Expense',
  'Purchase': 'Purchase',
  'purchases': 'Purchase',
  'CashSession': 'CashSession',
  'cash_sessions': 'CashSession',
  'CashMovement': 'CashMovement',
  'cash_movements': 'CashMovement',
  'StockMovement': 'StockMovement',
  'stock_movements': 'StockMovement',
  'LoyaltyTransaction': 'LoyaltyTransaction',
  'loyalty_transactions': 'LoyaltyTransaction',
  'Category': 'Category',
  'categories': 'Category',
  'Supplier': 'Supplier',
  'suppliers': 'Supplier',
}

/**
 * Upsert a single record into the local SQLite table identified by
 * `entityType` (a SCHEMA key like 'products', 'customers'). Converts
 * the camelCase record to snake_case, filters columns against the
 * known schema, and uses the idempotent `upsert()` helper so re-pulled
 * records overwrite stale local copies without resetting columns the
 * server doesn't return (e.g. local-only description on products).
 *
 * For products, the server returns stock via stockLevels[]; we
 * collapse that into the flat current_stock column SQLite uses.
 */
async function upsertRecord(db: any, entityType: string, record: any): Promise<void> {
  const schema = SCHEMA[entityType]
  if (!schema) {
    console.warn(`[Desktop Sync] No schema for entity "${entityType}" — skipping upsert`)
    return
  }
  const snake = objToSnake(record)
  if (entityType === 'products' && snake.current_stock === undefined && Array.isArray(record.stockLevels)) {
    snake.current_stock = record.stockLevels.reduce((s: number, l: any) => s + (l.quantity || 0), 0)
  }

  // Convert JS booleans to SQLite integers (1/0).
  // The server (Supabase/PostgREST) returns active, track_stock, etc. as
  // JSON booleans (true/false). SQLite columns are INTEGER, but SQLite's
  // dynamic typing accepts strings like "true" — which then fails
  // integer comparison (active = 1). Converting to 1/0 fixes this.
  const BOOLEAN_COLUMNS = ['active', 'track_stock', 'allow_negative_stock']
  for (const col of BOOLEAN_COLUMNS) {
    if (col in snake) {
      if (snake[col] === true || snake[col] === 'true') snake[col] = 1
      else if (snake[col] === false || snake[col] === 'false') snake[col] = 0
    }
  }

  const columns = Object.keys(snake).filter(k => schema.columns.includes(k))
  if (!columns.includes('id')) return
  const values = columns.map(k => snake[k])
  // Use secondary conflict column for tables with UNIQUE constraints (sku, phone)
  const secondaryConflictCol = entityType === 'products' ? 'sku' : entityType === 'customers' ? 'phone' : undefined
  try {
    await upsert(db, schema.table, columns, values, secondaryConflictCol)
  } catch (e) {
    console.warn(`[Desktop Sync] Upsert into ${entityType} failed:`, sqlErrorMsg(e))
  }
}

/**
 * DELTA PULL — fetch only the records changed since the last sync
 * cursor. Uses `/api/sync/pull?since=ISO&entities=...` which returns
 * a per-entity bundle of { records, deleted, lastUpdated }.
 *
 *   - New/updated records are upserted into local SQLite.
 *   - Soft-deleted records (server-reported IDs in `deleted[]`) are
 *     tombstoned locally via `UPDATE ... SET deleted_at = now()`.
 *   - The per-entity cursor is updated to the server's reported
 *     `lastUpdated` so the next pull only fetches newer changes.
 *
 * On the first run (no cursor), `since` defaults to epoch and the
 * server returns ALL records (initial sync).
 */
export async function pullFromServer(): Promise<{ pulled: number }> {
  const db = await getDb()
  if (!db) return { pulled: 0 }

  // Read per-entity cursors from sync_metadata
  let metaRows: any[] = []
  try {
    metaRows = await db.select(
      'SELECT entity_type, last_cursor FROM sync_metadata WHERE device_id = ?',
      [getDeviceId()]
    )
  } catch (e: any) {
    console.warn('[Desktop Sync] sync_metadata read failed — treating as initial sync:', sqlErrorMsg(e))
  }
  const cursors: Record<string, string> = {}
  for (const m of metaRows) cursors[m.entity_type] = m.last_cursor || ''

  const entities = ['products', 'categories', 'customers', 'suppliers', 'sales', 'expenses',
    'purchases', 'expense_categories', 'loyalty_accounts', 'loyalty_transactions',
    'cash_sessions', 'cash_movements', 'stock_movements', 'settings', 'audit_logs',
    'stock_levels', 'registers']
  // Use the oldest non-empty cursor across all entities as the `since` value.
  // The server filters per-entity by updatedAt/createdAt > since, so using
  // the oldest cursor guarantees we never miss a record. For initial sync
  // (no cursors at all), since=epoch returns everything.
  const since =
    cursors['products']
    || cursors['categories']
    || cursors['customers']
    || cursors['suppliers']
    || cursors['sales']
    || cursors['expenses']
    || new Date(0).toISOString()

  const token = useAuthStore.getState().token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(
      `${PRODUCTION_URL}/api/sync/pull?since=${encodeURIComponent(since)}&entities=${entities.join(',')}`,
      { headers }
    )
    if (!res.ok) {
      console.warn(`[Desktop Sync] /api/sync/pull returned HTTP ${res.status}`)
      return { pulled: 0 }
    }
    const data = await res.json()
    if (!data?.success) {
      console.warn('[Desktop Sync] /api/sync/pull reported failure:', data?.error)
      return { pulled: 0 }
    }

    let pulled = 0
    const entityBundle = data.data?.entities || {}

    // Disable FK checks during bulk sync pull — records may arrive in
    // an order that violates FK constraints (e.g., products before
    // categories, sales before customers). We re-enable FK after.
    try {
      await db.execute('PRAGMA foreign_keys = OFF')
    } catch (e: any) {
      console.warn('[Desktop Sync] Could not disable FK for bulk pull:', sqlErrorMsg(e))
    }

    for (const [entityType, payload] of Object.entries(entityBundle)) {
      const p = payload as any
      const records = Array.isArray(p.records) ? p.records : []
      const deleted = Array.isArray(p.deleted) ? p.deleted : []
      const lastUpdated = p.lastUpdated

      for (const record of records) {
        await upsertRecord(db, entityType, record)
        pulled++
      }

      // Tombstone soft-deleted records locally (server reports the IDs).
      const schema = SCHEMA[entityType]
      if (schema && schema.columns.includes('deleted_at')) {
        for (const delId of deleted) {
          try {
            await db.execute(
              `UPDATE ${schema.table} SET deleted_at = datetime('now') WHERE id = ?`,
              [delId]
            )
          } catch (e) {
            console.warn(`[Desktop Sync] Tombstone ${entityType}:${delId} failed:`, sqlErrorMsg(e))
          }
        }
      }

      // Update cursor for this entity (use server-reported lastUpdated).
      if (lastUpdated) {
        try {
          await db.execute(
            `INSERT OR REPLACE INTO sync_metadata (device_id, entity_type, last_cursor, last_pull_at)
             VALUES (?, ?, ?, datetime('now'))`,
            [getDeviceId(), entityType, lastUpdated]
          )
        } catch (e) {
          console.warn(`[Desktop Sync] Cursor update for ${entityType} failed:`, sqlErrorMsg(e))
        }
      }
    }

    console.log(`[Desktop Sync] Delta-pulled ${pulled} rows from server`)

    // Re-enable FK enforcement after bulk pull
    try {
      await db.execute('PRAGMA foreign_keys = ON')
    } catch (e: any) {
      console.warn('[Desktop Sync] Could not re-enable FK after bulk pull:', sqlErrorMsg(e))
    }

    return { pulled }
  } catch (e) {
    // Re-enable FK even on error
    try { await db.execute('PRAGMA foreign_keys = ON') } catch {}
    console.error('[Desktop Sync] Pull failed:', sqlErrorMsg(e))
    return { pulled: 0 }
  }
}

/**
 * BATCH PUSH — POSTs all pending sync_queue rows in a single
 * /api/sync/push call. The server dispatches each operation by
 * entity type, applies per-operation idempotency via clientTxnId,
 * and returns a per-operation result array (success/error).
 *
 *   - Successful ops are marked SYNCED.
 *   - Failed ops have attempts incremented and the error stored.
 *   - Operations whose entity type isn't supported by the server
 *     (e.g. 'users', 'SaleReturn') are reported as failed by the
 *     server; after 5 attempts they're filtered out by the
 *     `attempts < 5` filter in the SELECT.
 *
 * Network errors / non-OK HTTP responses mark every pending row
 * with attempts+1 so they will be retried on the next cycle (up
 * to the 5-attempt ceiling).
 */
export async function pushPendingToServer(): Promise<{ pushed: number; failed: number }> {
  const db = await getDb()
  if (!db) return { pushed: 0, failed: 0 }

  const pending = await db.select("SELECT * FROM sync_queue WHERE status = 'PENDING' AND attempts < 5 LIMIT 200")
  if (pending.length === 0) return { pushed: 0, failed: 0 }

  const token = useAuthStore.getState().token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  // Build the operations batch. The server expects:
  //   { clientTxnId, entityType, operation, entityId, data, items?, payments? }
  // The desktop sync_queue stores camelCase payload (already matching `data`).
  // For Sale operations, the server needs `items` (and optional `payments`)
  // at the top level too — lift them out of `data` so handleSale can read them.
  const operations = pending.map((item: any) => {
    const payload = JSON.parse(item.payload || '{}')
    const entityType = SERVER_ENTITY_MAP[item.entity_type] || item.entity_type
    const op: Record<string, unknown> = {
      clientTxnId: item.client_txn_id,
      entityType,
      operation: item.operation,
      entityId: item.entity_id,
      data: payload,
    }
    if (entityType === 'Sale' && Array.isArray(payload.items)) {
      op.items = payload.items
    }
    if (entityType === 'Sale' && Array.isArray(payload.payments)) {
      op.payments = payload.payments
    }
    return op
  })

  try {
    const res = await fetch(`${PRODUCTION_URL}/api/sync/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: getDeviceId(), operations }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.success) {
      // Whole batch failed — mark all pending rows with attempt +1.
      const errMsg = data?.error || `HTTP ${res.status}`
      for (const item of pending) {
        await db.execute(
          'UPDATE sync_queue SET attempts = attempts + 1, error = ? WHERE id = ?',
          [errMsg, item.id]
        )
      }
      console.warn(`[Desktop Sync] Push batch failed (${errMsg}) — ${pending.length} ops re-queued`)
      return { pushed: 0, failed: pending.length }
    }

    let pushed = 0
    let failed = 0
    const results = data.data?.results || []
    for (let i = 0; i < pending.length; i++) {
      const result = results[i]
      const item = pending[i]
      if (result?.success) {
        await db.execute(
          "UPDATE sync_queue SET status = 'SYNCED', synced_at = datetime('now'), error = NULL WHERE id = ?",
          [item.id]
        )
        pushed++
      } else {
        await db.execute(
          'UPDATE sync_queue SET attempts = attempts + 1, error = ? WHERE id = ?',
          [result?.error || 'Unknown error', item.id]
        )
        failed++
      }
    }
    console.log(`[Desktop Sync] Pushed ${pushed}, failed ${failed}`)
    return { pushed, failed }
  } catch (e) {
    // Network error — mark all pending rows with attempt +1.
    for (const item of pending) {
      await db.execute(
        'UPDATE sync_queue SET attempts = attempts + 1, error = ? WHERE id = ?',
        [sqlErrorMsg(e), item.id]
      )
    }
    console.error('[Desktop Sync] Push exception:', sqlErrorMsg(e))
    return { pushed: 0, failed: pending.length }
  }
}

let desktopSyncing = false

/** Push then pull. Safe to call repeatedly — no-ops when offline or not desktop. */
export async function runDesktopSync(): Promise<{ pushed: number; pulled: number }> {
  if (!isDesktop()) return { pushed: 0, pulled: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { pushed: 0, pulled: 0 }
  if (desktopSyncing) return { pushed: 0, pulled: 0 }

  desktopSyncing = true
  try {
    const { pushed } = await pushPendingToServer()
    const { pulled } = await pullFromServer()
    return { pushed, pulled }
  } finally {
    desktopSyncing = false
  }
}

let desktopSyncInterval: ReturnType<typeof setInterval> | null = null

/** Call once on app startup (desktop only). Pulls immediately, then every 30s while online. */
export function startDesktopSyncEngine() {
  if (!isDesktop() || typeof window === 'undefined') return
  if (desktopSyncInterval) return // already running

  const kick = () => { runDesktopSync().catch((e) => console.warn('[Desktop Sync] error:', sqlErrorMsg(e))) }

  window.addEventListener('online', kick)
  setTimeout(kick, 1500) // initial pull shortly after login/boot
  desktopSyncInterval = setInterval(kick, 30000)
}
