'use client'

import Dexie, { Table } from 'dexie'

// ============================================================
// LOCAL DATABASE — The PRIMARY data store for the POS
// ============================================================
//
// ARCHITECTURE:
//   Browser/PWA → Local DB (Dexie) → Sync Engine → Supabase
//
// FLOW:
//   1. All reads/writes go to Local DB first (instant, offline)
//   2. Sync Engine pushes changes to Supabase when online
//   3. Sync Engine pulls changes from Supabase when online
//   4. Each record has a `clientTxnId` (UUID) for idempotency
//      — prevents duplicates if sync runs twice
//
// IDEMPOTENCY:
//   Every sale/transaction gets a unique clientTxnId BEFORE saving.
//   When syncing to Supabase, the server checks if clientTxnId exists.
//   If yes → returns existing record (no duplicate).
//   If no → creates new record.
//
// MULTI-DEVICE SYNC:
//   When device A creates a sale → saves locally → syncs to Supabase.
//   When device B syncs → pulls the sale from Supabase → saves locally.
//   Both devices see the same data.
// ============================================================

export interface LocalProduct {
  id: string
  clientTxnId?: string
  name: string
  nameAr?: string
  sku: string
  barcode?: string
  categoryId?: string
  brandId?: string
  unitId?: string
  supplierId?: string
  purchaseCost: number
  sellingPrice: number
  wholesalePrice: number
  taxRate: number
  minStock: number
  reorderLevel: number
  trackStock: boolean
  allowNegativeStock: boolean
  avgCost: number
  image?: string
  active: boolean
  currentStock: number
  lastSynced: number
  // Sync tracking
  syncStatus?: 'synced' | 'pending' | 'updated' | 'deleted'
  pendingStockDelta?: number
}

export interface LocalCategory {
  id: string
  name: string
  nameAr?: string
  parentId?: string
  color?: string
  icon?: string
  lastSynced: number
}

export interface LocalCustomer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  tier: string
  active: boolean
  loyaltyPoints: number
  totalEarned: number
  totalRedeemed: number
  lastSynced: number
}

export interface LocalSale {
  id: string // clientTxnId — used for idempotency
  clientTxnId: string // SAME as id — prevents duplicates on sync
  invoiceNumber: string
  items: LocalSaleItem[]
  customerId?: string
  customerName?: string
  userId: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  paidAmount: number
  changeAmount: number
  paymentMethod: string
  paymentDetails?: string
  loyaltyEarned: number
  loyaltyRedeemed: number
  note?: string
  createdAt: string
  // Sync tracking
  syncStatus: 'pending' | 'synced' | 'failed'
  syncError?: string
  syncAttempts: number
  lastSyncedAt?: number
}

export interface LocalSaleItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
  costAtSale: number
}

export interface LocalStockMovement {
  id: string
  clientTxnId: string
  productId: string
  type: string
  quantity: number
  refType?: string
  refId?: string
  note?: string
  createdAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}

export interface LocalSetting {
  key: string
  value: string
  category: string
  lastSynced: number
}

export interface LocalUser {
  id: string
  username: string
  name: string
  role: string
  permissions: string[]
  phone?: string
  pin?: string
  lastSynced: number
}

export interface SyncQueueItem {
  id?: number
  entityType: string
  entityId: string
  clientTxnId: string // Idempotency key
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  payload: string
  status: 'PENDING' | 'SYNCED' | 'FAILED'
  attempts: number
  maxAttempts: number
  error?: string
  createdAt: number
  syncedAt?: number
}

class BeautyPOSDatabase extends Dexie {
  products!: Table<LocalProduct, string>
  categories!: Table<LocalCategory, string>
  customers!: Table<LocalCustomer, string>
  sales!: Table<LocalSale, string>
  stockMovements!: Table<LocalStockMovement, string>
  settings!: Table<LocalSetting, string>
  users!: Table<LocalUser, string>
  syncQueue!: Table<SyncQueueItem, number>

  constructor() {
    super('BeautyPOSDB_v3')
    this.version(1).stores({
      products: 'id, sku, barcode, name, nameAr, categoryId, active, syncStatus, lastSynced',
      categories: 'id, name, nameAr, parentId, lastSynced',
      customers: 'id, name, phone, tier, active, lastSynced',
      sales: 'id, clientTxnId, invoiceNumber, createdAt, syncStatus, customerId, userId',
      stockMovements: 'id, clientTxnId, productId, type, createdAt, syncStatus',
      settings: 'key, category, lastSynced',
      users: 'id, username, role, lastSynced',
      syncQueue: '++id, entityType, clientTxnId, status, createdAt, syncedAt',
    })
  }
}

export const localDB = new BeautyPOSDatabase()

// ============================================================
// UUID GENERATOR — for clientTxnId (idempotency)
// ============================================================
export function generateUUID(): string {
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
// INITIALIZATION — Pull all data from server on first launch
// ============================================================

let initPromise: Promise<void> | null = null
let isInitialized = false

export async function initLocalDB(): Promise<void> {
  if (isInitialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      // ============================================================
      // DESKTOP MODE — SQLite is the PRIMARY data store.
      // IndexedDB (Dexie) is NOT used in desktop mode.
      // Skip all server pulls — they would return HTML (no Next.js server).
      // ============================================================
      const { isDesktop } = await import('./desktop-mode')
      if (isDesktop()) {
        console.log('[LocalDB] Desktop mode detected — SQLite is primary, skipping IndexedDB init')
        isInitialized = true
        return
      }

      console.log('[LocalDB] Starting initialization...')
      const productCount = await localDB.products.count()

      if (productCount === 0) {
        console.log('[LocalDB] First install — pulling all data from server...')
        await pullAllFromServer()
      } else {
        console.log(`[LocalDB] Local DB has ${productCount} products. Checking for updates...`)
        await syncRecentChanges()
      }

      isInitialized = true
      console.log('[LocalDB] Initialization complete')
    } catch (e) {
      console.error('[LocalDB] Init error:', e)
    }
  })()

  return initPromise
}

async function pullAllFromServer() {
  const now = Date.now()

  // Fetch all data from API — use apiFetch which handles JSON parsing
  const { apiFetch } = await import('./api')

  try {
    const [products, categories, customers, settingsData] = await Promise.all([
      apiFetch('/products?limit=1000').catch(() => null),
      apiFetch('/categories').catch(() => null),
      apiFetch('/customers?limit=1000').catch(() => null),
      apiFetch('/settings').catch(() => null),
    ])

    // Products
    if (products && Array.isArray(products)) {
      const localProducts: LocalProduct[] = products.map((p: any) => ({
        ...p,
        currentStock: p.currentStock ?? (p.stockLevels?.reduce((s: number, l: any) => s + l.quantity, 0) || 0),
        lastSynced: now,
        syncStatus: 'synced',
      }))
      await localDB.products.bulkPut(localProducts)
      console.log(`[LocalDB] Cached ${localProducts.length} products`)
    }

    // Categories
    if (categories && Array.isArray(categories)) {
      const localCategories: LocalCategory[] = categories.map((c: any) => ({ ...c, lastSynced: now }))
      await localDB.categories.bulkPut(localCategories)
      console.log(`[LocalDB] Cached ${localCategories.length} categories`)
    }

    // Customers
    if (customers && Array.isArray(customers)) {
      const localCustomers: LocalCustomer[] = customers.map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone, email: c.email,
        address: c.address, tier: c.tier || 'BRONZE', active: c.active !== false,
        loyaltyPoints: c.loyaltyAccount?.points || 0,
        totalEarned: c.loyaltyAccount?.totalEarned || 0,
        totalRedeemed: c.loyaltyAccount?.totalRedeemed || 0,
        lastSynced: now,
      }))
      await localDB.customers.bulkPut(localCustomers)
      console.log(`[LocalDB] Cached ${localCustomers.length} customers`)
    }

    // Settings
    if (settingsData && settingsData.flat) {
      const localSettings: LocalSetting[] = settingsData.flat.map((s: any) => ({
        key: s.key, value: s.value, category: s.category, lastSynced: now,
      }))
      await localDB.settings.bulkPut(localSettings)
      console.log(`[LocalDB] Cached ${localSettings.length} settings`)
    }
  } catch (e) {
    console.error('[LocalDB] Pull from server failed:', e)
  }
}

async function syncRecentChanges() {
  // Quick sync — pull latest products
  try {
    const { apiFetch } = await import('./api')
    const products = await apiFetch('/products?limit=1000')
    if (products && Array.isArray(products)) {
      const now = Date.now()
      const localProducts: LocalProduct[] = products.map((p: any) => ({
        ...p,
        currentStock: p.currentStock ?? (p.stockLevels?.reduce((s: number, l: any) => s + l.quantity, 0) || 0),
        lastSynced: now,
        syncStatus: 'synced',
      }))
      await localDB.products.bulkPut(localProducts)
    }
  } catch (e) {
    // ignore — offline
  }
}

// ============================================================
// OFFLINE QUERIES — Fast local lookups
// ============================================================

export async function searchLocalProducts(query: string, categoryId?: string): Promise<LocalProduct[]> {
  const all = await localDB.products.toArray()
  let results = all.filter(p => p.active !== false)

  if (query) {
    const q = query.toLowerCase()
    results = results.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.nameAr?.includes(query) ||
      p.barcode?.includes(query) ||
      p.sku?.toLowerCase().includes(q)
    )
  }

  if (categoryId) {
    results = results.filter(p => p.categoryId === categoryId)
  }

  return results.slice(0, 200)
}

export async function findProductByBarcode(barcode: string): Promise<LocalProduct | undefined> {
  return localDB.products.where('barcode').equals(barcode).first()
}

export async function getAllCategories(): Promise<LocalCategory[]> {
  return localDB.categories.toArray()
}

export async function searchLocalCustomers(query: string): Promise<LocalCustomer[]> {
  const all = await localDB.customers.toArray()
  if (!query) return all.filter(c => c.active !== false).slice(0, 100)
  const q = query.toLowerCase()
  return all.filter(c =>
    c.active !== false && (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(query)
    )
  ).slice(0, 100)
}

export async function getPendingSyncCount(): Promise<number> {
  return localDB.syncQueue.where('status').equals('PENDING').count()
}

// ============================================================
// OFFLINE WRITE — Create sale locally (instant, offline)
// ============================================================

export async function createLocalSale(saleData: {
  items: LocalSaleItem[]
  customerId?: string
  customerName?: string
  userId: string
  discountAmount: number
  taxAmount: number
  total: number
  paidAmount: number
  paymentMethod: string
  paymentDetails?: string
  loyaltyEarned: number
  loyaltyRedeemed: number
  note?: string
}): Promise<LocalSale> {
  const now = new Date().toISOString()
  const saleId = generateUUID() // This is the idempotency key
  const invoiceNumber = `LOCAL-${Date.now()}`
  const subtotal = saleData.items.reduce((s, i) => s + i.total, 0) - saleData.taxAmount
  const changeAmount = Math.max(0, saleData.paidAmount - saleData.total)

  const sale: LocalSale = {
    id: saleId,
    clientTxnId: saleId, // Same as id — idempotency
    invoiceNumber,
    items: saleData.items,
    customerId: saleData.customerId,
    customerName: saleData.customerName,
    userId: saleData.userId,
    subtotal,
    discountAmount: saleData.discountAmount,
    taxAmount: saleData.taxAmount,
    total: saleData.total,
    paidAmount: saleData.paidAmount,
    changeAmount,
    paymentMethod: saleData.paymentMethod,
    paymentDetails: saleData.paymentDetails,
    loyaltyEarned: saleData.loyaltyEarned,
    loyaltyRedeemed: saleData.loyaltyRedeemed,
    note: saleData.note,
    createdAt: now,
    syncStatus: 'pending',
    syncAttempts: 0,
  }

  // 1. Save sale to local DB
  await localDB.sales.put(sale)

  // 2. Update local stock (decrement)
  for (const item of saleData.items) {
    const product = await localDB.products.get(item.productId)
    if (product) {
      product.currentStock -= item.quantity
      await localDB.products.put(product)
    }

    // 3. Create stock movement
    const movement: LocalStockMovement = {
      id: generateUUID(),
      clientTxnId: saleId,
      productId: item.productId,
      type: 'SALE',
      quantity: -item.quantity,
      refType: 'Sale',
      refId: saleId,
      note: invoiceNumber,
      createdAt: now,
      syncStatus: 'pending',
    }
    await localDB.stockMovements.put(movement)
  }

  // 4. Update customer loyalty
  if (saleData.customerId && saleData.loyaltyEarned > 0) {
    const customer = await localDB.customers.get(saleData.customerId)
    if (customer) {
      customer.loyaltyPoints += saleData.loyaltyEarned
      customer.totalEarned += saleData.loyaltyEarned
      await localDB.customers.put(customer)
    }
  }

  // 5. Add to sync queue (will be pushed to Supabase when online)
  await localDB.syncQueue.add({
    entityType: 'Sale',
    entityId: saleId,
    clientTxnId: saleId, // IDEMPOTENCY KEY
    operation: 'CREATE',
    payload: JSON.stringify({
      ...sale,
      items: saleData.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      userId: saleData.userId,
      customerId: saleData.customerId,
      discountAmount: saleData.discountAmount,
      paymentMethod: saleData.paymentMethod,
      paidAmount: saleData.paidAmount,
      loyaltyRedeem: saleData.loyaltyRedeemed,
      note: saleData.note,
    }),
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 5,
    createdAt: Date.now(),
  })

  console.log(`[LocalDB] Sale created offline: ${invoiceNumber} (clientTxnId: ${saleId})`)
  return sale
}

// ============================================================
// MAINTENANCE
// ============================================================

export async function clearLocalDB() {
  await localDB.products.clear()
  await localDB.categories.clear()
  await localDB.customers.clear()
  await localDB.sales.clear()
  await localDB.stockMovements.clear()
  await localDB.settings.clear()
  await localDB.users.clear()
  await localDB.syncQueue.clear()
  isInitialized = false
  initPromise = null
}

export async function refreshLocalData() {
  await clearLocalDB()
  await initLocalDB()
}

export async function getLocalDBStats() {
  const [products, categories, customers, sales, pendingSync, stockMovements, settings, users, syncQueue] = await Promise.all([
    localDB.products.count(),
    localDB.categories.count(),
    localDB.customers.count(),
    localDB.sales.count(),
    getPendingSyncCount(),
    localDB.stockMovements.count(),
    localDB.settings.count(),
    localDB.users.count(),
    localDB.syncQueue.count(),
  ])
  // No loyalty-transactions table exists in the local (Dexie) store yet.
  const loyaltyTransactions = 0
  return { products, categories, customers, sales, pendingSync, stockMovements, loyaltyTransactions, settings, users, syncQueue }
}
