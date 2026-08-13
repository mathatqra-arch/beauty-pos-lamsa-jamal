// ============================================================
// لمسة جمال — Clean Sync Engine (Bidirectional + Idempotent)
// ============================================================
// Replaces the fragmented sync-engine.ts. ONE engine that:
//
//   1. PUSH: drains the local syncQueue → server (each item carries
//      clientTxnId so retries never duplicate)
//   2. PULL: fetches remote changes since lastSync (master data =
//      last-write-wins; transactions = append-only)
//
// Conflict resolution:
//   • Master data (products, customers, categories): updatedAt wins
//   • Transactions (sales, movements): append-only, never overwrite
//   • Stock: synchronized via movements, never absolute values
//
// Runs every 15s when online. Skips entirely in Tauri desktop mode
// (desktop uses its own SQLite-primary sync via desktop-api.ts).
// ============================================================

'use client'

import { localDB, getPendingSyncCount, generateUUID } from '../local-db'
import { useConnectionStore, useAuthStore } from '../store'
import { getAuthHeaders } from '../api'
import { isDesktop } from '../desktop-mode'
import { runtime } from './client'

let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false
let lastSyncTime = 0

const SYNC_INTERVAL_MS = 15_000
const PULL_INTERVAL_MS = 60_000
const MAX_ATTEMPTS = 5

// ============================================================
// LIFECYCLE
// ============================================================

export function startSyncEngine(): void {
  if (typeof window === 'undefined') return

  // Desktop uses SQLite as primary — this Dexie engine must NOT run there.
  if (isDesktop()) {
    console.log('[Sync] Desktop mode — SQLite is primary, skipping Dexie sync')
    return
  }

  const updateOnlineStatus = () => {
    const online = navigator.onLine
    useConnectionStore.getState().setOnline(online)
    if (online) setTimeout(() => runFullSync(), 1000)
  }

  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  updateOnlineStatus()

  syncInterval = setInterval(async () => {
    if (!navigator.onLine || isSyncing) return
    const pending = await getPendingSyncCount()
    useConnectionStore.getState().setPendingSync(pending)
    if (pending > 0 || Date.now() - lastSyncTime > PULL_INTERVAL_MS) {
      runFullSync()
    }
  }, SYNC_INTERVAL_MS)
}

export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

// ============================================================
// FULL SYNC
// ============================================================

export async function runFullSync(): Promise<{ pushed: number; pulled: number; errors: number }> {
  if (isSyncing) return { pushed: 0, pulled: 0, errors: 0 }
  isSyncing = true
  useConnectionStore.getState().setSyncing(true)

  let pushed = 0, pulled = 0, errors = 0
  try {
    pushed = await pushPendingChanges()
    pulled = await pullRemoteChanges()
    const remaining = await getPendingSyncCount()
    useConnectionStore.getState().setPendingSync(remaining)
    lastSyncTime = Date.now()
    console.log(`[Sync] done: pushed=${pushed} pulled=${pulled} pending=${remaining}`)
  } catch (e) {
    console.error('[Sync] error:', e)
    errors++
  } finally {
    isSyncing = false
    useConnectionStore.getState().setSyncing(false)
  }
  return { pushed, pulled, errors }
}

// ============================================================
// PUSH — drain local queue to server (idempotent)
// ============================================================

const ENTITY_ENDPOINT: Record<string, string> = {
  Sale: '/api/sales',
  Customer: '/api/customers',
  Expense: '/api/expenses',
  Product: '/api/products',
  StockMovement: '/api/inventory/adjust',
  Purchase: '/api/purchases',
}

async function pushPendingChanges(): Promise<number> {
  const pending = await localDB.syncQueue.where('status').equals('PENDING').toArray()
  let pushed = 0

  for (const item of pending) {
    if (item.attempts >= item.maxAttempts) {
      await localDB.syncQueue.update(item.id!, { status: 'FAILED' })
      continue
    }

    const endpoint = ENTITY_ENDPOINT[item.entityType]
    if (!endpoint) {
      await localDB.syncQueue.update(item.id!, {
        status: 'FAILED',
        error: `unsupported_entity: ${item.entityType}`,
      })
      continue
    }

    try {
      const token = useAuthStore.getState().token
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Client-Txn-Id': item.clientTxnId, // IDEMPOTENCY KEY
      }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: item.payload,
      })
      const data = await res.json()
      const ok = res.ok && data.success

      if (ok) {
        // For sales, update local invoice number with server-assigned one
        if (item.entityType === 'Sale' && data.data?.invoiceNumber) {
          const localSale = await localDB.sales.get(item.entityId)
          if (localSale) {
            localSale.invoiceNumber = data.data.invoiceNumber
            localSale.syncStatus = 'synced'
            localSale.lastSyncedAt = Date.now()
            await localDB.sales.put(localSale)
          }
        }
        await localDB.syncQueue.update(item.id!, { status: 'SYNCED', syncedAt: Date.now() })
        pushed++
      } else {
        await localDB.syncQueue.update(item.id!, {
          attempts: item.attempts + 1,
          error: data.error || `HTTP ${res.status}`,
        })
      }
    } catch (e: any) {
      console.error(`[Sync] push error ${item.entityType}:${item.entityId}`, e.message)
      await localDB.syncQueue.update(item.id!, {
        attempts: item.attempts + 1,
        error: e.message,
      })
    }
  }
  return pushed
}

// ============================================================
// PULL — fetch remote changes (multi-device sync)
// ============================================================

async function pullRemoteChanges(): Promise<number> {
  let pulled = 0
  try {
    const lastSyncSetting = await localDB.settings.get('sync.lastSync')
    const since = lastSyncSetting?.value ? new Date(lastSyncSetting.value) : new Date(0)

    pulled += await pullProducts()
    pulled += await pullSales(since)

    await localDB.settings.put({
      key: 'sync.lastSync',
      value: new Date().toISOString(),
      category: 'sync',
      lastSynced: Date.now(),
    })
  } catch (e) {
    console.error('[Sync] pull error:', e)
  }
  return pulled
}

async function pullProducts(): Promise<number> {
  const res = await fetch('/api/products?limit=1000', { headers: getAuthHeaders() })
  if (!res.ok) return 0
  const data = await res.json()
  if (!data.success || !data.data) return 0
  const now = Date.now()
  let pulled = 0
  for (const p of data.data) {
    const existing = await localDB.products.get(p.id)
    const remoteUpdated = new Date(p.updatedAt || p.createdAt || 0).getTime()
    const localSynced = existing?.lastSynced || 0
    // last-write-wins for master data
    if (!existing || remoteUpdated > localSynced) {
      await localDB.products.put({
        ...p,
        currentStock: p.currentStock ?? (p.stockLevels?.reduce((s: number, l: any) => s + l.quantity, 0) || 0),
        lastSynced: now,
        syncStatus: 'synced',
      })
      pulled++
    }
  }
  return pulled
}

async function pullSales(since: Date): Promise<number> {
  const res = await fetch('/api/sales?limit=500', { headers: getAuthHeaders() })
  if (!res.ok) return 0
  const data = await res.json()
  if (!data.success || !data.data) return 0
  let pulled = 0
  for (const s of data.data) {
    // append-only: skip if we already have it (by id OR clientTxnId)
    const existing = await localDB.sales.get(s.id)
    if (existing) continue
    const byTxn = await localDB.sales.where('clientTxnId').equals(s.clientTxnId || s.id).first()
    if (byTxn) continue
    await localDB.sales.put({
      id: s.id,
      clientTxnId: s.clientTxnId || s.id,
      invoiceNumber: s.invoiceNumber,
      items: s.items || [],
      customerId: s.customerId,
      customerName: s.customerName,
      userId: s.userId,
      subtotal: s.subtotal,
      discountAmount: s.discountAmount,
      taxAmount: s.taxAmount,
      total: s.total,
      paidAmount: s.paidAmount,
      changeAmount: s.changeAmount,
      paymentMethod: s.paymentMethod,
      loyaltyEarned: s.loyaltyEarned || 0,
      loyaltyRedeemed: s.loyaltyRedeemed || 0,
      note: s.note,
      createdAt: s.createdAt,
      syncStatus: 'synced',
      syncAttempts: 0,
      lastSyncedAt: Date.now(),
    })
    pulled++
  }
  return pulled
}

// ============================================================
// MANUAL TRIGGERS
// ============================================================

export const syncNow = runFullSync

export function simulateOffline() {
  useConnectionStore.getState().setOnline(false)
}

export function simulateOnline() {
  useConnectionStore.getState().setOnline(true)
  return runFullSync()
}

/**
 * Test a Supabase URL + anon key by running a minimal read against the
 * Setting table (present in every deployment). Used by the Settings UI.
 */
export async function testSupabaseConnection(
  url: string,
  key: string
): Promise<{ success: boolean; message: string }> {
  if (!url || !key) return { success: false, message: 'الرجاء إدخال رابط Supabase URL والمفتاح' }
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(url, key)
    const { error } = await client.from('Setting').select('id').limit(1)
    if (error) return { success: false, message: `فشل الاتصال: ${error.message}` }
    return { success: true, message: 'تم الاتصال بـ Supabase بنجاح' }
  } catch (e: any) {
    return { success: false, message: `فشل الاتصال: ${e?.message || 'خطأ غير معروف'}` }
  }
}

// Re-export for backward compatibility with code importing from sync-engine
export { generateUUID }
