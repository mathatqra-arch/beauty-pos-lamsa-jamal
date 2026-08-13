import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// SERVER-SIDE DATABASE ACCESS — Supabase REST API (PostgREST)
// ============================================================
// Prisma-compatible interface backed by Supabase REST API.
// Supports: findMany, findFirst, findUnique, create, createMany,
//           update, updateMany, delete, count, aggregate, groupBy
//           include (relations), select, nested where filters
// ============================================================

// ============================================================
// LAZY SUPABASE CLIENT — deferred so `next build` succeeds without env vars
// ============================================================
// `next build` evaluates route modules under NODE_ENV=production to collect
// page data. If we threw at the top level when SUPABASE creds are missing,
// the build would fail on any CI/build server that doesn't have runtime
// secrets. Instead, we create the client lazily on first actual DB access
// and throw there if creds are missing in production.
//
// Build: succeeds (no top-level throw).
// Runtime (prod, no creds): throws on first DB call with a clear message.
// Runtime (prod, creds set): works normally.
// Runtime (dev, no creds): returns errors from API routes, server still boots.
let _client: SupabaseClient | null = null
let _clientInitAttempted = false
let _credsWarningShown = false

function getClient(): SupabaseClient {
  if (_client) return _client
  if (_clientInitAttempted) {
    // Already tried and failed in production — re-throw the same error.
    throw new Error('Supabase client not available. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.')
  }
  _clientInitAttempted = true

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  // SECURITY: Use service_role key on server (bypasses RLS).
  // Falls back to anon key ONLY if service_role is not set (development).
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!url || !key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production. Set them in your deployment environment (e.g. Vercel Project Settings → Environment Variables).')
    }
    if (!_credsWarningShown) {
      console.warn('[DB] WARNING: Supabase credentials not set. API routes will return errors. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
      _credsWarningShown = true
    }
    // Return a null stub — routes will surface clear errors when used.
    return null as unknown as SupabaseClient
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (!_credsWarningShown) {
      console.warn('[DB] WARNING: SUPABASE_SERVICE_ROLE_KEY not set. Using anon key. RLS will block access.')
      _credsWarningShown = true
    }
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  })
  return _client
}

// Backwards-compat: some code reads `client` directly. We expose a getter
// via a Proxy so that the client is created on first property access.
const client: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient()
    const val = (c as any)[prop]
    return typeof val === 'function' ? val.bind(c) : val
  },
})

// ============================================================
// RELATION MAP — maps Prisma relation names to table + foreign key
// ============================================================
// This allows `include: { stockLevels: true }` to work by knowing
// which table to query and which foreign key to filter on.
// ============================================================

interface RelationDef {
  table: string       // Supabase table name
  foreignKey: string  // field on the related table that points to parent
  isMany: boolean     // true = hasMany, false = belongsTo
  // For belongsTo relations, the local field that holds the FK
  localKey?: string
}

const RELATIONS: Record<string, Record<string, RelationDef>> = {
  Product: {
    category: { table: 'Category', foreignKey: 'id', isMany: false, localKey: 'categoryId' },
    brand: { table: 'Brand', foreignKey: 'id', isMany: false, localKey: 'brandId' },
    unit: { table: 'Unit', foreignKey: 'id', isMany: false, localKey: 'unitId' },
    supplier: { table: 'Supplier', foreignKey: 'id', isMany: false, localKey: 'supplierId' },
    store: { table: 'Store', foreignKey: 'id', isMany: false, localKey: 'storeId' },
    stockLevels: { table: 'StockLevel', foreignKey: 'productId', isMany: true },
    stockMovements: { table: 'StockMovement', foreignKey: 'productId', isMany: true },
    saleItems: { table: 'SaleItem', foreignKey: 'productId', isMany: true },
    purchaseItems: { table: 'PurchaseItem', foreignKey: 'productId', isMany: true },
  },
  Category: {
    parent: { table: 'Category', foreignKey: 'id', isMany: false, localKey: 'parentId' },
    children: { table: 'Category', foreignKey: 'parentId', isMany: true },
    products: { table: 'Product', foreignKey: 'categoryId', isMany: true },
  },
  Customer: {
    sales: { table: 'Sale', foreignKey: 'customerId', isMany: true },
    loyaltyAccount: { table: 'LoyaltyAccount', foreignKey: 'customerId', isMany: false, localKey: 'id' },
    loyaltyTransactions: { table: 'LoyaltyTransaction', foreignKey: 'customerId', isMany: true },
  },
  Sale: {
    customer: { table: 'Customer', foreignKey: 'id', isMany: false, localKey: 'customerId' },
    user: { table: 'User', foreignKey: 'id', isMany: false, localKey: 'userId' },
    store: { table: 'Store', foreignKey: 'id', isMany: false, localKey: 'storeId' },
    register: { table: 'Register', foreignKey: 'id', isMany: false, localKey: 'registerId' },
    items: { table: 'SaleItem', foreignKey: 'saleId', isMany: true },
    saleItems: { table: 'SaleItem', foreignKey: 'saleId', isMany: true },
    payments: { table: 'SalePayment', foreignKey: 'saleId', isMany: true },
    salePayments: { table: 'SalePayment', foreignKey: 'saleId', isMany: true },
    returns: { table: 'SaleReturn', foreignKey: 'saleId', isMany: true },
    saleReturns: { table: 'SaleReturn', foreignKey: 'saleId', isMany: true },
  },
  SaleItem: {
    sale: { table: 'Sale', foreignKey: 'id', isMany: false, localKey: 'saleId' },
    product: { table: 'Product', foreignKey: 'id', isMany: false, localKey: 'productId' },
  },
  SalePayment: {
    sale: { table: 'Sale', foreignKey: 'id', isMany: false, localKey: 'saleId' },
  },
  SaleReturn: {
    sale: { table: 'Sale', foreignKey: 'id', isMany: false, localKey: 'saleId' },
    user: { table: 'User', foreignKey: 'id', isMany: false, localKey: 'userId' },
    items: { table: 'SaleReturnItem', foreignKey: 'saleReturnId', isMany: true },
  },
  SaleReturnItem: {
    saleReturn: { table: 'SaleReturn', foreignKey: 'id', isMany: false, localKey: 'saleReturnId' },
    product: { table: 'Product', foreignKey: 'id', isMany: false, localKey: 'productId' },
  },
  StockLevel: {
    product: { table: 'Product', foreignKey: 'id', isMany: false, localKey: 'productId' },
    warehouse: { table: 'Warehouse', foreignKey: 'id', isMany: false, localKey: 'warehouseId' },
  },
  StockMovement: {
    product: { table: 'Product', foreignKey: 'id', isMany: false, localKey: 'productId' },
    warehouse: { table: 'Warehouse', foreignKey: 'id', isMany: false, localKey: 'warehouseId' },
  },
  StockAdjustment: {
    product: { table: 'Product', foreignKey: 'id', isMany: false, localKey: 'productId' },
    user: { table: 'User', foreignKey: 'id', isMany: false, localKey: 'userId' },
  },
  User: {
    sales: { table: 'Sale', foreignKey: 'userId', isMany: true },
    purchases: { table: 'Purchase', foreignKey: 'userId', isMany: true },
    cashSessions: { table: 'CashSession', foreignKey: 'userId', isMany: true },
    expenses: { table: 'Expense', foreignKey: 'userId', isMany: true },
    auditLogs: { table: 'AuditLog', foreignKey: 'userId', isMany: true },
    saleReturns: { table: 'SaleReturn', foreignKey: 'userId', isMany: true },
  },
  Store: {
    registers: { table: 'Register', foreignKey: 'storeId', isMany: true },
    products: { table: 'Product', foreignKey: 'storeId', isMany: true },
    sales: { table: 'Sale', foreignKey: 'storeId', isMany: true },
    purchases: { table: 'Purchase', foreignKey: 'storeId', isMany: true },
    warehouses: { table: 'Warehouse', foreignKey: 'storeId', isMany: true },
  },
  Register: {
    store: { table: 'Store', foreignKey: 'id', isMany: false, localKey: 'storeId' },
    cashSessions: { table: 'CashSession', foreignKey: 'registerId', isMany: true },
    sales: { table: 'Sale', foreignKey: 'registerId', isMany: true },
  },
  Warehouse: {
    store: { table: 'Store', foreignKey: 'id', isMany: false, localKey: 'storeId' },
    stockLevels: { table: 'StockLevel', foreignKey: 'warehouseId', isMany: true },
    stockMovements: { table: 'StockMovement', foreignKey: 'warehouseId', isMany: true },
  },
  Supplier: {
    products: { table: 'Product', foreignKey: 'supplierId', isMany: true },
    purchases: { table: 'Purchase', foreignKey: 'supplierId', isMany: true },
  },
  Brand: {
    products: { table: 'Product', foreignKey: 'brandId', isMany: true },
  },
  Unit: {
    products: { table: 'Product', foreignKey: 'unitId', isMany: true },
  },
  LoyaltyAccount: {
    customer: { table: 'Customer', foreignKey: 'id', isMany: false, localKey: 'customerId' },
  },
  LoyaltyTransaction: {
    customer: { table: 'Customer', foreignKey: 'id', isMany: false, localKey: 'customerId' },
  },
  LoyaltyTier: {},
  LoyaltyCampaign: {},
  Purchase: {
    supplier: { table: 'Supplier', foreignKey: 'id', isMany: false, localKey: 'supplierId' },
    store: { table: 'Store', foreignKey: 'id', isMany: false, localKey: 'storeId' },
    user: { table: 'User', foreignKey: 'id', isMany: false, localKey: 'userId' },
    items: { table: 'PurchaseItem', foreignKey: 'purchaseId', isMany: true },
    purchaseItems: { table: 'PurchaseItem', foreignKey: 'purchaseId', isMany: true },
  },
  PurchaseItem: {
    purchase: { table: 'Purchase', foreignKey: 'id', isMany: false, localKey: 'purchaseId' },
    product: { table: 'Product', foreignKey: 'id', isMany: false, localKey: 'productId' },
  },
  CashSession: {
    register: { table: 'Register', foreignKey: 'id', isMany: false, localKey: 'registerId' },
    user: { table: 'User', foreignKey: 'id', isMany: false, localKey: 'userId' },
    movements: { table: 'CashMovement', foreignKey: 'sessionId', isMany: true },
    cashMovements: { table: 'CashMovement', foreignKey: 'sessionId', isMany: true },
  },
  CashMovement: {
    session: { table: 'CashSession', foreignKey: 'id', isMany: false, localKey: 'sessionId' },
  },
  ExpenseCategory: {
    expenses: { table: 'Expense', foreignKey: 'categoryId', isMany: true },
  },
  Expense: {
    category: { table: 'ExpenseCategory', foreignKey: 'id', isMany: false, localKey: 'categoryId' },
    user: { table: 'User', foreignKey: 'id', isMany: false, localKey: 'userId' },
  },
  Setting: {},
  AuditLog: {
    user: { table: 'User', foreignKey: 'id', isMany: false, localKey: 'userId' },
  },
  SyncQueue: {},
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function convertDates(data: Record<string, any>): Record<string, any> {
  const result = { ...data }
  for (const [k, v] of Object.entries(result)) {
    if (v instanceof Date) result[k] = v.toISOString()
  }
  return result
}

// Apply Prisma-style where filters to a Supabase query
function applyFilters(query: any, where?: Record<string, any>): any {
  if (!where) return query

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue

    // Handle OR clause
    if (key === 'OR' && Array.isArray(value)) {
      const orStr = value.map((cond: Record<string, any>) =>
        Object.entries(cond).map(([k, v]) => {
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            const [op, val] = Object.entries(v)[0]
            return `${k}.${op === 'gte' ? 'gte' : op === 'lt' ? 'lt' : op === 'gt' ? 'gt' : op === 'lte' ? 'lte' : op === 'not' ? 'neq' : 'eq'}.${val instanceof Date ? val.toISOString() : v}`
          }
          return `${k}.eq.${v}`
        }).join(',')
      ).join(',')
      query = query.or(orStr)
      continue
    }

    // Handle AND clause
    if (key === 'AND' && Array.isArray(value)) {
      for (const cond of value) {
        query = applyFilters(query, cond)
      }
      continue
    }

    // Handle NOT clause
    if (key === 'NOT' && typeof value === 'object') {
      for (const [nk, nv] of Object.entries(value)) {
        query = query.neq(nk, nv as any)
      }
      continue
    }

    // Handle relation filters (e.g., sale: { createdAt: { gte: ... } })
    // These are detected when the key matches a relation name
    // NOTE: This is handled separately in findMany for performance

    // Handle Date objects
    if (value instanceof Date) {
      query = query.eq(key, value.toISOString())
      continue
    }

    // Handle operator objects (e.g., { gte: date, lt: date, contains: "text", in: [...] })
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [op, val] of Object.entries(value)) {
        const v = val instanceof Date ? val.toISOString() : val
        if (op === 'gte') query = query.gte(key, v as any)
        else if (op === 'lte') query = query.lte(key, v as any)
        else if (op === 'gt') query = query.gt(key, v as any)
        else if (op === 'lt') query = query.lt(key, v as any)
        else if (op === 'not') query = query.neq(key, v as any)
        else if (op === 'contains') query = query.ilike(key, `%${v}%`)
        else if (op === 'startsWith') query = query.ilike(key, `${v}%`)
        else if (op === 'endsWith') query = query.ilike(key, `%${v}`)
        else if (op === 'in' && Array.isArray(v)) {
          if (v.length > 0) query = query.in(key, v)
          else return query.eq(key, '__none__') // empty in = no results
        }
        else if (op === 'notIn' && Array.isArray(v)) {
          if (v.length > 0) query = query.not(key, 'in', `(${v.join(',')})`)
        }
        else query = query.eq(key, v as any)
      }
      continue
    }

    // Simple equality
    query = query.eq(key, value)
  }

  return query
}

// Detect if a where key is a relation filter (nested object that's not an operator)
function isRelationFilter(tableName: string, key: string, value: any): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof Date) {
    return false
  }
  // Check if it's an operator object (gte, lt, etc.)
  const operatorKeys = ['gte', 'lte', 'gt', 'lt', 'not', 'contains', 'startsWith', 'endsWith', 'in', 'notIn', 'equals']
  const keys = Object.keys(value)
  const isOperatorObj = keys.every(k => operatorKeys.includes(k))
  if (isOperatorObj) return false

  // Check if key is a known relation
  const relations = RELATIONS[tableName]
  return relations ? key in relations : false
}

function applyOrder(query: any, orderBy?: Record<string, 'asc' | 'desc'>): any {
  if (!orderBy) return query
  for (const [field, dir] of Object.entries(orderBy)) {
    query = query.order(field, { ascending: dir === 'asc' })
  }
  return query
}

// ============================================================
// PRISMA-COMPATIBLE MODEL
// ============================================================

interface QueryOptions {
  where?: Record<string, any>
  orderBy?: Record<string, 'asc' | 'desc'>
  take?: number
  skip?: number
  include?: Record<string, any>
  select?: Record<string, boolean>
  distinct?: string[]
}

class PrismaModel<T extends Record<string, any>> {
  constructor(private tableName: string) {}

  // Extract relation filters from where clause (they need special handling)
  private extractRelationFilters(where?: Record<string, any>): { direct: Record<string, any>, relations: Record<string, any> } {
    if (!where) return { direct: {}, relations: {} }
    const direct: Record<string, any> = {}
    const relations: Record<string, any> = {}

    for (const [key, value] of Object.entries(where)) {
      if (key === 'OR' || key === 'AND' || key === 'NOT') {
        direct[key] = value
        continue
      }
      if (isRelationFilter(this.tableName, key, value)) {
        relations[key] = value
      } else {
        direct[key] = value
      }
    }

    return { direct, relations }
  }

  // Apply relation filters by fetching matching IDs first
  private async applyRelationFilters(relations: Record<string, any>): Promise<{ hasFilter: boolean; ids: Set<string> | null }> {
    const relationEntries = Object.entries(relations)
    if (relationEntries.length === 0) return { hasFilter: false, ids: null }

    let validIds: Set<string> | null = null

    for (const [relName, filter] of relationEntries) {
      const rel = RELATIONS[this.tableName]?.[relName]
      if (!rel) continue

      // For belongsTo relations (e.g., SaleItem.sale), the filter is on the parent
      // We need to find parent IDs that match, then filter current table by localKey
      const relModel = new PrismaModel<any>(rel.table)
      const matchingRecords = await relModel.findMany({ where: filter, take: 5000 })
      const matchingIds = new Set<string>(matchingRecords.map((r: any) => r.id as string))

      if (rel.isMany) {
        // hasMany: current model is parent, filter by parent ID
        // This shouldn't happen in where clause normally
      } else if (rel.localKey) {
        // belongsTo: filter current table where localKey IN matchingIds
        if (validIds === null) {
          validIds = matchingIds
        } else {
          // Intersect
          const prev: Set<string> = validIds
          validIds = new Set<string>(Array.from(prev).filter((id: string) => matchingIds.has(id)))
        }
      }
    }

    return { hasFilter: validIds !== null, ids: validIds }
  }

  async findMany(opts: QueryOptions = {}): Promise<T[]> {
    const { direct, relations } = this.extractRelationFilters(opts.where)

    // Handle relation filters
    let extraFilter: Record<string, any> | null = null
    const relResult = await this.applyRelationFilters(relations)
    if (relResult.hasFilter && relResult.ids) {
      const ids = [...relResult.ids]
      if (ids.length === 0) return [] // No matching records
      extraFilter = { id: { in: ids } }
    }

    // Build query
    let query = client.from(this.tableName).select('*')
    const combinedWhere = extraFilter ? { ...direct, id: { in: [...relResult.ids!] } } : direct
    query = applyFilters(query, combinedWhere)
    query = applyOrder(query, opts.orderBy)
    if (opts.take) query = query.limit(opts.take)
    if (opts.skip) query = query.range(opts.skip, opts.skip + (opts.take || 1000) - 1)

    // Handle distinct
    if (opts.distinct && opts.distinct.length > 0) {
      // Supabase doesn't support distinct directly, we'll dedupe in memory
    }

    const { data, error } = await query
    if (error) throw new Error(`DB error [${this.tableName}.findMany]: ${error.message}`)

    let results = (data || []) as T[]

    // Dedupe if distinct
    if (opts.distinct && opts.distinct.length > 0) {
      const seen = new Set<string>()
      results = results.filter((r: any) => {
        const key = opts.distinct!.map(f => r[f]).join('|')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    // Handle select (project fields)
    if (opts.select) {
      results = results.map((r: any) => {
        const projected: any = {}
        for (const [field, include] of Object.entries(opts.select!)) {
          if (include && field in r) projected[field] = r[field]
        }
        return projected
      })
    }

    // Handle include (load relations)
    if (opts.include && Object.keys(opts.include).length > 0) {
      results = await this.loadIncludes(results, opts.include)
    }

    return results
  }

  async findFirst(opts: QueryOptions = {}): Promise<T | null> {
    const results = await this.findMany({ ...opts, take: 1 })
    return results[0] || null
  }

  async findUnique(opts: { where: Record<string, any>; include?: Record<string, any> }): Promise<T | null> {
    let query = client.from(this.tableName).select('*').limit(1)
    query = applyFilters(query, opts.where)
    const { data, error } = await query
    if (error) throw new Error(`DB error [${this.tableName}.findUnique]: ${error.message}`)
    let result = (data && data[0]) || null
    if (result && opts.include) {
      const loaded = await this.loadIncludes([result], opts.include)
      result = loaded[0]
    }
    return result as T | null
  }

  async create(opts: { data: Record<string, any>; include?: Record<string, any> }): Promise<T> {
    const data = convertDates({ ...opts.data })
    if (!data.id) data.id = generateId()

    const { data: result, error } = await client.from(this.tableName).insert(data).select().single()
    if (error) throw new Error(`DB error [${this.tableName}.create]: ${error.message}`)

    let record = result as T
    if (opts.include) {
      const loaded = await this.loadIncludes([record], opts.include)
      record = loaded[0]
    }
    return record
  }

  async createMany(opts: { data: Record<string, any>[] }): Promise<{ count: number }> {
    const rows = opts.data.map(d => {
      const row = convertDates({ ...d })
      if (!row.id) row.id = generateId()
      return row
    })
    const { error } = await client.from(this.tableName).insert(rows)
    if (error) throw new Error(`DB error [${this.tableName}.createMany]: ${error.message}`)
    return { count: rows.length }
  }

  async update(opts: { where: Record<string, any>; data: Record<string, any>; include?: Record<string, any> }): Promise<T> {
    const data = convertDates({ ...opts.data })
    let query = client.from(this.tableName).update(data)
    query = applyFilters(query, opts.where)
    const { data: result, error } = await query.select().single()
    if (error) throw new Error(`DB error [${this.tableName}.update]: ${error.message}`)

    let record = result as T
    if (opts.include) {
      const loaded = await this.loadIncludes([record], opts.include)
      record = loaded[0]
    }
    return record
  }

  async updateMany(opts: { where: Record<string, any>; data: Record<string, any> }): Promise<{ count: number }> {
    const data = convertDates({ ...opts.data })
    let query = client.from(this.tableName).update(data)
    query = applyFilters(query, opts.where)
    const { data: result, error } = await query as { data: any[] | null; error: any }
    if (error) throw new Error(`DB error [${this.tableName}.updateMany]: ${error.message}`)
    return { count: result?.length || 0 }
  }

  async delete(opts: { where: Record<string, any> }): Promise<T> {
    let query = client.from(this.tableName).delete()
    query = applyFilters(query, opts.where)
    const { data, error } = await query.select().single()
    if (error) throw new Error(`DB error [${this.tableName}.delete]: ${error.message}`)
    return data as T
  }

  async count(opts?: { where?: Record<string, any> }): Promise<number> {
    const { direct, relations } = this.extractRelationFilters(opts?.where)

    let query = client.from(this.tableName).select('*', { count: 'exact', head: true })

    // Handle relation filters
    const relResult = await this.applyRelationFilters(relations)
    if (relResult.hasFilter && relResult.ids) {
      const ids = [...relResult.ids]
      if (ids.length === 0) return 0
      query = applyFilters(query, { ...direct, id: { in: ids } })
    } else {
      query = applyFilters(query, direct)
    }

    const { count, error } = await query
    if (error) throw new Error(`DB error [${this.tableName}.count]: ${error.message}`)
    return count || 0
  }

  async aggregate(opts: {
    where?: Record<string, any>
    _sum?: Record<string, true>
    _count?: boolean | Record<string, true>
    _avg?: Record<string, true>
    _min?: Record<string, true>
    _max?: Record<string, true>
  }): Promise<any> {
    const items = await this.findMany({ where: opts.where })
    const result: any = {}

    if (opts._sum) {
      result._sum = {}
      for (const field of Object.keys(opts._sum)) {
        result._sum[field] = items.reduce((s, i) => s + (Number(i[field]) || 0), 0)
      }
    }
    if (opts._count !== undefined) {
      if (typeof opts._count === 'boolean') {
        result._count = items.length
      } else {
        result._count = {}
        for (const field of Object.keys(opts._count)) {
          result._count[field] = items.filter(i => i[field] !== null && i[field] !== undefined).length
        }
      }
    }
    if (opts._avg) {
      result._avg = {}
      for (const field of Object.keys(opts._avg)) {
        const sum = items.reduce((s, i) => s + (Number(i[field]) || 0), 0)
        result._avg[field] = items.length > 0 ? sum / items.length : 0
      }
    }
    if (opts._min) {
      result._min = {}
      for (const field of Object.keys(opts._min)) {
        result._min[field] = items.reduce((m, i) => (m === null || (Number(i[field]) || 0) < m) ? (Number(i[field]) || 0) : m, null as any)
      }
    }
    if (opts._max) {
      result._max = {}
      for (const field of Object.keys(opts._max)) {
        result._max[field] = items.reduce((m, i) => (m === null || (Number(i[field]) || 0) > m) ? (Number(i[field]) || 0) : m, null as any)
      }
    }
    return result
  }

  // groupBy — groups records by fields and computes aggregates
  async groupBy(opts: {
    by: string[]
    where?: Record<string, any>
    _count?: boolean | Record<string, true>
    _sum?: Record<string, true>
    _avg?: Record<string, true>
    orderBy?: Record<string, 'asc' | 'desc'>
    take?: number
  }): Promise<any[]> {
    const items = await this.findMany({ where: opts.where, take: opts.take || 10000 })

    // Group by the specified fields
    const groups = new Map<string, any[]>()
    for (const item of items) {
      const key = opts.by.map(f => item[f]).join('|||')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }

    // Build result with aggregates
    const results: any[] = []
    for (const [, groupItems] of groups) {
      const first = groupItems[0]
      const result: any = {}
      for (const field of opts.by) {
        result[field] = first[field]
      }

      if (opts._count !== undefined) {
        if (typeof opts._count === 'boolean') {
          result._count = groupItems.length
        } else {
          result._count = {}
          for (const field of Object.keys(opts._count)) {
            result._count[field] = groupItems.filter(i => i[field] !== null && i[field] !== undefined).length
          }
        }
      }
      if (opts._sum) {
        result._sum = {}
        for (const field of Object.keys(opts._sum)) {
          result._sum[field] = groupItems.reduce((s, i) => s + (Number(i[field]) || 0), 0)
        }
      }
      if (opts._avg) {
        result._avg = {}
        for (const field of Object.keys(opts._avg)) {
          const sum = groupItems.reduce((s, i) => s + (Number(i[field]) || 0), 0)
          result._avg[field] = groupItems.length > 0 ? sum / groupItems.length : 0
        }
      }

      results.push(result)
    }

    // Sort if orderBy
    if (opts.orderBy) {
      for (const [field, dir] of Object.entries(opts.orderBy)) {
        // Handle aggregate orderBy (e.g., _count: 'desc')
        if (field === '_count' && typeof dir === 'string') {
          results.sort((a, b) => {
            const av = typeof a._count === 'number' ? a._count : (a._count?._all || 0)
            const bv = typeof b._count === 'number' ? b._count : (b._count?._all || 0)
            return dir === 'asc' ? av - bv : bv - av
          })
        } else {
          results.sort((a, b) => {
            const av = a[field]
            const bv = b[field]
            if (av < bv) return dir === 'asc' ? -1 : 1
            if (av > bv) return dir === 'asc' ? 1 : -1
            return 0
          })
        }
      }
    }

    return results
  }

  // ============================================================
  // LOAD INCLUDES — fetch and attach related data
  // ============================================================
  private async loadIncludes(records: any[], include: Record<string, any>): Promise<any[]> {
    if (records.length === 0) return records

    for (const [relName, relOpts] of Object.entries(include)) {
      const rel = RELATIONS[this.tableName]?.[relName]
      if (!rel) {
        // Unknown relation — skip
        continue
      }

      if (rel.isMany) {
        // hasMany: collect parent IDs, fetch children, group by FK
        const parentIds = records.map(r => r.id).filter(Boolean)
        if (parentIds.length === 0) continue

        const childModel = new PrismaModel<any>(rel.table)
        const childOpts: QueryOptions = {
          where: { [rel.foreignKey]: { in: parentIds } },
          take: 10000,
        }

        // Handle nested include/select in relation options
        if (typeof relOpts === 'object' && relOpts !== null) {
          if (relOpts.include) childOpts.include = relOpts.include
          if (relOpts.select) childOpts.select = relOpts.select
          if (relOpts.where) childOpts.where = { ...childOpts.where, ...relOpts.where }
          if (relOpts.orderBy) childOpts.orderBy = relOpts.orderBy
          if (relOpts.take) childOpts.take = relOpts.take
        }

        const children = await childModel.findMany(childOpts)

        // Group children by foreign key
        const childrenByFk = new Map<string, any[]>()
        for (const child of children) {
          const fk = child[rel.foreignKey]
          if (!childrenByFk.has(fk)) childrenByFk.set(fk, [])
          childrenByFk.get(fk)!.push(child)
        }

        // Attach to parent records
        for (const record of records) {
          record[relName] = childrenByFk.get(record.id) || []
        }
      } else {
        // belongsTo: collect local key values, fetch parents, map by ID
        const localKey = rel.localKey || relName + 'Id'
        const parentIds = [...new Set(records.map(r => r[localKey]).filter(Boolean))]
        if (parentIds.length === 0) {
          for (const record of records) record[relName] = null
          continue
        }

        const parentModel = new PrismaModel<any>(rel.table)
        const parentOpts: QueryOptions = {
          where: { id: { in: parentIds } },
          take: 10000,
        }

        if (typeof relOpts === 'object' && relOpts !== null) {
          if (relOpts.include) parentOpts.include = relOpts.include
          if (relOpts.select) parentOpts.select = relOpts.select
        }

        const parents = await parentModel.findMany(parentOpts)
        const parentMap = new Map(parents.map((p: any) => [p.id, p]))

        for (const record of records) {
          record[relName] = parentMap.get(record[localKey]) || null
        }
      }
    }

    return records
  }
}

// ============================================================
// EXPORT — Prisma-compatible db object
// ============================================================

export const db = {
  user: new PrismaModel<any>('User'),
  store: new PrismaModel<any>('Store'),
  register: new PrismaModel<any>('Register'),
  warehouse: new PrismaModel<any>('Warehouse'),
  category: new PrismaModel<any>('Category'),
  brand: new PrismaModel<any>('Brand'),
  unit: new PrismaModel<any>('Unit'),
  product: new PrismaModel<any>('Product'),
  supplier: new PrismaModel<any>('Supplier'),
  stockLevel: new PrismaModel<any>('StockLevel'),
  stockMovement: new PrismaModel<any>('StockMovement'),
  stockAdjustment: new PrismaModel<any>('StockAdjustment'),
  customer: new PrismaModel<any>('Customer'),
  loyaltyTier: new PrismaModel<any>('LoyaltyTier'),
  loyaltyAccount: new PrismaModel<any>('LoyaltyAccount'),
  loyaltyTransaction: new PrismaModel<any>('LoyaltyTransaction'),
  loyaltyCampaign: new PrismaModel<any>('LoyaltyCampaign'),
  sale: new PrismaModel<any>('Sale'),
  saleItem: new PrismaModel<any>('SaleItem'),
  salePayment: new PrismaModel<any>('SalePayment'),
  saleReturn: new PrismaModel<any>('SaleReturn'),
  saleReturnItem: new PrismaModel<any>('SaleReturnItem'),
  purchase: new PrismaModel<any>('Purchase'),
  purchaseItem: new PrismaModel<any>('PurchaseItem'),
  cashSession: new PrismaModel<any>('CashSession'),
  cashMovement: new PrismaModel<any>('CashMovement'),
  expenseCategory: new PrismaModel<any>('ExpenseCategory'),
  expense: new PrismaModel<any>('Expense'),
  setting: new PrismaModel<any>('Setting'),
  auditLog: new PrismaModel<any>('AuditLog'),
  syncQueue: new PrismaModel<any>('SyncQueue'),
  // Conceptual idempotency table for sync push operations.
  // Tracks `clientTxnId` + `entityType` + `entityId` + `result` so that
  // retried batches from the desktop client do not double-execute.
  // If this table does not exist on Supabase yet, all calls throw and the
  // push route falls back to entity-level idempotency (checking by id).
  syncOperation: new PrismaModel<any>('SyncOperation'),

  // Transaction support (sequential — Supabase REST has no transactions)
  $transaction: async (fn: (tx: typeof db) => Promise<any>) => fn(db),
}

export { client as supabaseClient }
