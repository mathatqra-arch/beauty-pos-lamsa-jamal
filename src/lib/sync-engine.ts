'use client'

import { localDB, getPendingSyncCount, generateUUID } from './local-db'
import { useConnectionStore, useAuthStore } from './store'
import { apiFetch, getAuthHeaders } from './api'
import { createClient } from '@supabase/supabase-js'
import { isDesktop } from './desktop-mode'

// ============================================================
// SYNC ENGINE — Bidirectional sync with idempotency
// ============================================================
//
// FLOW:
//   1. PUSH: Send pending local changes to server
//      - Each item has clientTxnId (idempotency key)
//      - Server checks: if clientTxnId exists → return existing (no duplicate)
//      - If not → create new
//
//   2. PULL: Fetch changes from server since lastSync
//      - Get new sales/products/customers from Supabase
//      - Save to local DB
//      - This handles multi-device sync:
//        Device A creates sale → Supabase → Device B pulls it
//
//   3. CONFLICT RESOLUTION:
//      - Master data (products, customers): last-write-wins (updatedAt)
//      - Transactions (sales): append-only, never overwrite
//      - Stock: synchronized via movements, not absolute values
//
// IDEMPOTENCY:
//   Each sale has clientTxnId. If sync runs twice or network
//   retries, the server recognizes the same clientTxnId and
//   returns the existing sale — NO DUPLICATES.
// ============================================================

let syncInterval: ReturnType<typeof setInterval> | null = null
let isSyncing = false
let lastSyncTime = 0

export function startSyncEngine() {
  if (typeof window === 'undefined') return

  // DESKTOP MODE — SQLite is the PRIMARY data store in the Tauri app.
  // This Dexie/IndexedDB + relative-URL sync engine must NOT run there:
  //   1. Dexie ≠ pos.db (different database, wrong data)
  //   2. relative `/api/...` fetches 404 inside the Tauri webview
  //      (no Next.js server is running)
  // The desktop has its own `startDesktopSyncEngine` in desktop-api.ts
  // that uses absolute URLs + the real SQLite database.
  if (isDesktop()) {
    console.log('[SyncEngine] Desktop mode detected — skipping Dexie sync (SQLite is primary)')
    return
  }

  // Monitor online/offline status
  const updateOnlineStatus = () => {
    const online = navigator.onLine
    useConnectionStore.getState().setOnline(online)
    if (online) {
      setTimeout(() => runFullSync(), 1000)
    }
  }

  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  updateOnlineStatus()

  // Run sync every 15 seconds when online
  syncInterval = setInterval(async () => {
    if (navigator.onLine && !isSyncing) {
      const pending = await getPendingSyncCount()
      useConnectionStore.getState().setPendingSync(pending)

      // Sync if there are pending items OR every 60 seconds for pull
      if (pending > 0 || Date.now() - lastSyncTime > 60000) {
        runFullSync()
      }
    }
  }, 15000)
}

export function stopSyncEngine() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

// ============================================================
// FULL SYNC — Push + Pull
// ============================================================

export async function runFullSync(): Promise<{ pushed: number; pulled: number; errors: number }> {
  if (isSyncing) return { pushed: 0, pulled: 0, errors: 0 }
  isSyncing = true
  useConnectionStore.getState().setSyncing(true)

  let pushed = 0
  let pulled = 0
  let errors = 0

  try {
    // STEP 1: Push pending local changes
    pushed = await pushPendingChanges()

    // STEP 2: Pull remote changes (from Supabase via API)
    pulled = await pullRemoteChanges()

    // Update pending count
    const remaining = await getPendingSyncCount()
    useConnectionStore.getState().setPendingSync(remaining)
    lastSyncTime = Date.now()

    console.log(`[Sync] Done: pushed ${pushed}, pulled ${pulled}, pending ${remaining}`)
  } catch (e) {
    console.error('[Sync] Error:', e)
    errors++
  } finally {
    isSyncing = false
    useConnectionStore.getState().setSyncing(false)
  }

  return { pushed, pulled, errors }
}

// ============================================================
// PUSH — Send local changes to server (with idempotency)
// ============================================================

async function pushPendingChanges(): Promise<number> {
  const pending = await localDB.syncQueue.where('status').equals('PENDING').toArray()
  let pushed = 0

  for (const item of pending) {
    if (item.attempts >= item.maxAttempts) {
      await localDB.syncQueue.update(item.id!, { status: 'FAILED' })
      continue
    }

    try {
      const payload = JSON.parse(item.payload)
      const token = useAuthStore.getState().token
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Client-Txn-Id': item.clientTxnId, // IDEMPOTENCY KEY
      }
      if (token) headers['Authorization'] = `Bearer ${token}`

      let success = false
      let serverData: any = null

      if (item.entityType === 'Sale') {
        const res = await fetch('/api/sales', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        success = res.ok && data.success
        serverData = data.data

        if (success) {
          // Update local sale with server invoice number
          const localSale = await localDB.sales.get(item.entityId)
          if (localSale && serverData?.invoiceNumber) {
            localSale.invoiceNumber = serverData.invoiceNumber
            localSale.syncStatus = 'synced'
            localSale.lastSyncedAt = Date.now()
            await localDB.sales.put(localSale)
          }
          pushed++
        }
      } else if (item.entityType === 'Customer') {
        // FIX: Previously only Sale was supported — Customer/Expense/etc. stuck PENDING forever
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        success = res.ok && data.success
        serverData = data.data
        if (success) pushed++
      } else if (item.entityType === 'Expense') {
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        success = res.ok && data.success
        serverData = data.data
        if (success) pushed++
      } else if (item.entityType === 'Product') {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        success = res.ok && data.success
        serverData = data.data
        if (success) pushed++
      } else if (item.entityType === 'StockMovement') {
        const res = await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        success = res.ok && data.success
        serverData = data.data
        if (success) pushed++
      } else {
        console.warn(`[Sync] Unsupported entityType: ${item.entityType} — marking as FAILED`)
        await localDB.syncQueue.update(item.id!, { status: 'FAILED', error: `unsupported_entity: ${item.entityType}` })
        continue
      }

      if (success) {
        await localDB.syncQueue.update(item.id!, {
          status: 'SYNCED',
          syncedAt: Date.now(),
        })
      } else {
        await localDB.syncQueue.update(item.id!, {
          attempts: item.attempts + 1,
        })
      }
    } catch (e: any) {
      console.error(`[Sync] Push error for ${item.entityType}:${item.entityId}`, e.message)
      await localDB.syncQueue.update(item.id!, {
        attempts: item.attempts + 1,
        error: e.message,
      })
    }
  }

  return pushed
}

// ============================================================
// PULL — Fetch changes from server (multi-device sync)
// ============================================================

async function pullRemoteChanges(): Promise<number> {
  let pulled = 0

  try {
    // Get last sync time from settings
    const lastSyncSetting = await localDB.settings.get('sync.lastSync')
    const since = lastSyncSetting?.value ? new Date(lastSyncSetting.value) : new Date(0)

    // Pull products (master data — update local)
    const productsRes = await fetch('/api/products?limit=1000', {
      headers: getAuthHeaders(),
    })
    if (productsRes.ok) {
      const data = await productsRes.json()
      if (data.success && data.data) {
        const now = Date.now()
        for (const p of data.data) {
          const existing = await localDB.products.get(p.id)
          const remoteUpdated = new Date(p.updatedAt || p.createdAt || 0).getTime()
          const localSynced = existing?.lastSynced || 0

          // Only update if remote is newer (last-write-wins for master data)
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
      }
    }

    // Pull sales (append-only — add new sales from other devices)
    const salesRes = await fetch('/api/sales?limit=500', {
      headers: getAuthHeaders(),
    })
    if (salesRes.ok) {
      const data = await salesRes.json()
      if (data.success && data.data) {
        for (const s of data.data) {
          // Check if we already have this sale (by server ID)
          const existing = await localDB.sales.get(s.id)
          if (!existing) {
            // Check if we have it by clientTxnId (in case we created it)
            const byClientTxn = await localDB.sales.where('clientTxnId').equals(s.clientTxnId || s.id).first()
            if (!byClientTxn) {
              // New sale from another device — save it
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
          }
        }
      }
    }

    // Update sync timestamp
    await localDB.settings.put({
      key: 'sync.lastSync',
      value: new Date().toISOString(),
      category: 'sync',
      lastSynced: Date.now(),
    })

  } catch (e) {
    console.error('[Sync] Pull error:', e)
  }

  return pulled
}

// ============================================================
// MANUAL TRIGGERS
// ============================================================

export async function syncNow() {
  return runFullSync()
}

export function simulateOffline() {
  useConnectionStore.getState().setOnline(false)
}

export function simulateOnline() {
  useConnectionStore.getState().setOnline(true)
  return runFullSync()
}

/**
 * Verifies a Supabase URL + anon key actually work, by creating a
 * throwaway client and running a minimal read against a table that
 * exists in every deployment (settings). Used by the "Test Connection"
 * button in Settings — was previously called but never implemented.
 */
export async function testSupabaseConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
  if (!url || !key) {
    return { success: false, message: 'الرجاء إدخال رابط Supabase URL والمفتاح (anon key)' }
  }
  try {
    const client = createClient(url, key)
    const { error } = await client.from('Setting').select('id').limit(1)
    if (error) {
      return { success: false, message: `فشل الاتصال: ${error.message}` }
    }
    return { success: true, message: 'تم الاتصال بـ Supabase بنجاح' }
  } catch (e: any) {
    return { success: false, message: `فشل الاتصال: ${e?.message || 'خطأ غير معروف'}` }
  }
}
