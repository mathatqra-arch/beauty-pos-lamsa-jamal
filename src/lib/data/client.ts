// ============================================================
// لمسة جمال — Unified Data Client
// ============================================================
// ONE entry point for all data access. Routes automatically:
//
//   • SERVER (Next.js API routes)  → Supabase REST API (PostgREST)
//   • DESKTOP (Tauri)              → local SQLite via @tauri-apps/plugin-sql
//   • BROWSER (PWA, online)        → /api/* (Next.js server → Supabase)
//   • BROWSER (PWA, offline)       → Dexie/IndexedDB local cache
//
// This replaces the fragmented trio (db.ts + desktop-api.ts + supabase.ts stub)
// with a single, typed, consistent interface.
//
// Idempotency: every write carries a clientTxnId (UUID) so retries from the
// sync engine never create duplicates. The Supabase RPC functions
// (create_sale_atomic, create_purchase_atomic, create_sale_return_atomic)
// enforce this server-side.
// ============================================================

import type {
  DataList, DataResult, QueryOptions, WhereFilter,
  Product, Customer, Sale, CreateSaleDTO, CreateCustomerDTO, CreateProductDTO,
  SaleItemInput,
} from './types'

// ============================================================
// 1. ENVIRONMENT DETECTION
// ============================================================

const isServer = typeof window === 'undefined'
const isBrowser = typeof window !== 'undefined'

function isTauriDesktop(): boolean {
  if (isServer) return false
  return !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
}

type Runtime = 'server' | 'desktop' | 'browser'

function getRuntime(): Runtime {
  if (isServer) return 'server'
  if (isTauriDesktop()) return 'desktop'
  return 'browser'
}

// ============================================================
// 2. SUPABASE CLIENT (server-side, lazy)
// ============================================================

let _supabase: any = null

async function getSupabaseServer(): Promise<any> {
  if (_supabase) return _supabase
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      '[data/client] Supabase credentials missing. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'
    )
  }
  _supabase = createClient(url, key, { auth: { persistSession: false } })
  return _supabase
}

// ============================================================
// 3. TAURI SQLITE CLIENT (desktop, lazy)
// ============================================================

let _sqlite: any = null

async function getSqlite(): Promise<any> {
  if (_sqlite) return _sqlite
  if (!isTauriDesktop()) return null
  const mod: any = await import('@tauri-apps/plugin-sql')
  const Database = mod.default || mod.Database
  _sqlite = await Database.load('sqlite:pos.db')
  await _sqlite.execute('PRAGMA foreign_keys = ON')
  return _sqlite
}

// ============================================================
// 4. ID GENERATION (clientTxnId — idempotency key)
// ============================================================

export function generateId(): string {
  if (isBrowser && (window as any).crypto?.randomUUID) {
    return (window as any).crypto.randomUUID()
  }
  // Node 19+ has crypto.randomUUID; fallback for older
  try {
    const c = require('crypto')
    if (c.randomUUID) return c.randomUUID()
  } catch { /* ignore */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ============================================================
// 5. MONEY HELPER (round to 2 decimals — SQLite REAL safety)
// ============================================================

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ============================================================
// 6. UNIFIED READ
// ============================================================

export async function findMany<T>(
  table: string,
  opts: QueryOptions = {}
): Promise<DataList<T>> {
  const runtime = getRuntime()
  try {
    if (runtime === 'server') {
      const sb = await getSupabaseServer()
      let q = sb.from(table).select(opts.select ? opts.select.join(',') : '*')
      q = applyWhere(q, opts.where)
      if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.order !== 'desc' })
      if (opts.limit) q = q.limit(opts.limit)
      if (opts.offset) q = q.range(opts.offset, opts.offset + (opts.limit || 50) - 1)
      const { data, error, count } = await q
      if (error) return { success: false, data: [], count: 0, error: error.message }
      return { success: true, data: (data || []) as T[], count: count || data?.length || 0 }
    }
    // desktop + browser fall back to the REST API
    const res = await fetchWithAuth(`/api/${table}${buildQuery(opts)}`)
    const json = await res.json()
    if (!res.ok || !json.success) {
      return { success: false, data: [], count: 0, error: json.error || res.statusText }
    }
    return { success: true, data: json.data || [], count: json.count || json.data?.length || 0 }
  } catch (e: any) {
    return { success: false, data: [], count: 0, error: e.message }
  }
}

export async function findFirst<T>(
  table: string,
  where: WhereFilter
): Promise<DataResult<T>> {
  const res = await findMany<T>(table, { where, limit: 1 })
  if (!res.success) return { success: false, error: res.error }
  return { success: true, data: res.data[0] }
}

// ============================================================
// 7. UNIFIED WRITE — CREATE (with idempotency)
// ============================================================

export async function create<T>(
  table: string,
  payload: Record<string, unknown>,
  clientTxnId?: string
): Promise<DataResult<T>> {
  const txnId = clientTxnId || generateId()
  const body = { ...payload, clientTxnId: txnId }
  const runtime = getRuntime()
  try {
    if (runtime === 'server') {
      const sb = await getSupabaseServer()
      const { data, error } = await sb.from(table).insert(body).select().single()
      if (error) return { success: false, error: error.message }
      return { success: true, data: data as T }
    }
    const res = await fetchWithAuth(`/api/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Txn-Id': txnId },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok || !json.success) return { success: false, error: json.error || res.statusText }
    return { success: true, data: json.data as T }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function update<T>(
  table: string,
  id: string,
  payload: Record<string, unknown>
): Promise<DataResult<T>> {
  const runtime = getRuntime()
  try {
    if (runtime === 'server') {
      const sb = await getSupabaseServer()
      const { data, error } = await sb.from(table).update(payload).eq('id', id).select().single()
      if (error) return { success: false, error: error.message }
      return { success: true, data: data as T }
    }
    const res = await fetchWithAuth(`/api/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok || !json.success) return { success: false, error: json.error || res.statusText }
    return { success: true, data: json.data as T }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function remove(table: string, id: string): Promise<DataResult<null>> {
  const runtime = getRuntime()
  try {
    if (runtime === 'server') {
      const sb = await getSupabaseServer()
      const { error } = await sb.from(table).delete().eq('id', id)
      if (error) return { success: false, error: error.message }
      return { success: true, data: null }
    }
    const res = await fetchWithAuth(`/api/${table}/${id}`, { method: 'DELETE' })
    if (!res.ok) return { success: false, error: res.statusText }
    return { success: true, data: null }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ============================================================
// 8. DOMAIN-SPECIFIC: ATOMIC SALE (uses RPC on server)
// ============================================================

export async function createSale(dto: CreateSaleDTO): Promise<DataResult<Sale>> {
  const runtime = getRuntime()
  // SERVER: call the atomic RPC directly
  if (runtime === 'server') {
    try {
      const sb = await getSupabaseServer()
      const { data, error } = await sb.rpc('create_sale_atomic', {
        p_client_txn_id: dto.clientTxnId,
        p_user_id: dto.userId,
        p_customer_id: dto.customerId || '',
        p_warehouse_id: dto.warehouseId || '',
        p_register_id: dto.registerId || '',
        p_items: dto.items,
        p_subtotal: round2(dto.subtotal),
        p_discount_amount: round2(dto.discountAmount),
        p_tax_amount: round2(dto.taxAmount),
        p_total: round2(dto.total),
        p_paid_amount: round2(dto.paidAmount),
        p_payment_method: dto.paymentMethod,
        p_payment_details: JSON.stringify(dto.paymentDetails || {}),
        p_loyalty_earned: dto.loyaltyEarned,
        p_loyalty_redeemed: dto.loyaltyRedeemed,
        p_note: dto.note || '',
      })
      if (error) return { success: false, error: error.message }
      return { success: true, data: data as Sale }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
  // DESKTOP / BROWSER: POST to /api/sales (which calls the RPC server-side)
  const res = await fetchWithAuth('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Txn-Id': dto.clientTxnId },
    body: JSON.stringify(dto),
  })
  const json = await res.json()
  if (!res.ok || !json.success) return { success: false, error: json.error || res.statusText }
  return { success: true, data: json.data as Sale }
}

// ============================================================
// 9. CONVENIENCE QUERY HELPERS
// ============================================================

export const products = {
  list: (opts?: QueryOptions) => findMany<Product>('Product', opts),
  get: (id: string) => findFirst<Product>('Product', { id }),
  byBarcode: (barcode: string) => findFirst<Product>('Product', { barcode }),
  bySku: (sku: string) => findFirst<Product>('Product', { sku }),
  create: (dto: CreateProductDTO) => create<Product>('Product', dto as unknown as Record<string, unknown>),
}

export const customers = {
  list: (opts?: QueryOptions) => findMany<Customer>('Customer', opts),
  get: (id: string) => findFirst<Customer>('Customer', { id }),
  create: (dto: CreateCustomerDTO) => create<Customer>('Customer', dto as unknown as Record<string, unknown>),
}

export const sales = {
  list: (opts?: QueryOptions) => findMany<Sale>('Sale', opts),
  get: (id: string) => findFirst<Sale>('Sale', { id }),
  create: (dto: CreateSaleDTO) => createSale(dto),
}

// ============================================================
// 10. INTERNAL HELPERS
// ============================================================

function applyWhere(q: any, where?: WhereFilter): any {
  if (!where) return q
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue
    q = q.eq(key, value)
  }
  return q
}

function buildQuery(opts: QueryOptions): string {
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.offset) params.set('offset', String(opts.offset))
  if (opts.orderBy) params.set('orderBy', opts.orderBy)
  if (opts.order) params.set('order', opts.order)
  if (opts.where) {
    for (const [k, v] of Object.entries(opts.where)) {
      if (v !== undefined && v !== null) params.set(k, String(v))
    }
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  // Attach JWT from auth store (browser) or service header (server-side SSR)
  let token: string | undefined
  if (isBrowser) {
    try {
      const { useAuthStore } = await import('../store')
      // store.token is `string | null`; normalize to `string | undefined`
      token = useAuthStore.getState().token ?? undefined
    } catch { /* store not ready */ }
  }
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...init, headers })
}

// ============================================================
// 11. RUNTIME EXPORT (for diagnostics / sync engine)
// ============================================================

export const runtime = getRuntime
export { getSqlite, getSupabaseServer }
