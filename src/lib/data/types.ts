// ============================================================
// لمسة جمال — Data Layer Types
// ============================================================
// Single source of truth for all entity types shared between the
// SQLite (desktop) and Supabase (cloud) data layers.
// Mirrors db/supabase-schema.sql + db/sqlite-schema.sql.
// ============================================================

export type UserRole =
  | 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAREHOUSE' | 'ACCOUNTANT' | 'PLATFORM'

export type CustomerTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'VIP'

export type SyncStatus = 'synced' | 'pending' | 'failed' | 'updated' | 'deleted'

export type SaleStatus = 'COMPLETED' | 'HELD' | 'REFUNDED' | 'PARTIAL_REFUND' | 'VOIDED'
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'SPLIT' | 'OTHER'
export type PurchaseStatus = 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'PAID'

export type StockMovementType =
  | 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT'
  | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'DAMAGE' | 'OPENING_STOCK'

export type LoyaltyTxType =
  | 'EARN' | 'REDEEM' | 'EXPIRE' | 'REVERSE' | 'BONUS' | 'ADJUSTMENT'

export type CashMovementType =
  | 'SALE' | 'CASH_IN' | 'CASH_OUT' | 'REFUND' | 'EXPENSE' | 'OPENING' | 'CLOSING'

// ============================================================
// ENTITIES
// ============================================================

export interface User {
  id: string
  email: string
  username: string
  passwordHash: string
  name: string
  phone?: string
  role: UserRole
  permissions: string[]
  active: boolean
  pin?: string
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export interface Store {
  id: string
  name: string
  address?: string
  phone?: string
  email?: string
  taxId?: string
  currency: string
  logo?: string
  receiptFooter?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  nameAr?: string
  sku: string
  barcode?: string
  barcodes: string[]
  categoryId?: string
  brandId?: string
  unitId?: string
  supplierId?: string
  storeId?: string
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
  description?: string
  active: boolean
  currentStock: number
  syncStatus: SyncStatus
  pendingStockDelta: number
  lastSynced: number
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  nameAr?: string
  parentId?: string
  color?: string
  icon?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  birthday?: string
  tier: CustomerTier
  active: boolean
  loyaltyPoints: number
  totalEarned: number
  totalRedeemed: number
  lastSynced: number
  createdAt: string
  updatedAt: string
}

export interface SaleItemInput {
  productId: string
  productName?: string
  quantity: number
  unitPrice: number
  discountAmount?: number
  taxAmount?: number
  total: number
  costAtSale?: number
}

export interface Sale {
  id: string
  clientTxnId: string
  invoiceNumber: string
  items: SaleItemInput[]
  customerId?: string
  customerName?: string
  userId: string
  subtotal: number
  discountAmount: number
  discountType?: 'PERCENT' | 'FIXED'
  taxAmount: number
  total: number
  paidAmount: number
  changeAmount: number
  status: SaleStatus
  paymentMethod: PaymentMethod
  paymentDetails: Record<string, unknown>
  loyaltyEarned: number
  loyaltyRedeemed: number
  note?: string
  held: boolean
  syncStatus: SyncStatus
  syncAttempts: number
  syncError?: string
  lastSyncedAt?: number
  createdAt: string
  updatedAt: string
}

export interface StockMovement {
  id: string
  clientTxnId: string
  productId: string
  warehouseId?: string
  type: StockMovementType
  quantity: number
  refType?: string
  refId?: string
  note?: string
  userId?: string
  syncStatus: SyncStatus
  createdAt: string
}

export interface SyncQueueItem {
  id?: number
  entityType: string
  entityId: string
  clientTxnId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  payload: string
  status: 'PENDING' | 'SYNCED' | 'FAILED'
  attempts: number
  maxAttempts: number
  error?: string
  createdAt: number
  syncedAt?: number
}

export interface Setting {
  key: string
  value: string
  category: string
  lastSynced: number
  updatedAt: string
}

// ============================================================
// DTOs (Data Transfer Objects) for create operations
// ============================================================

export interface CreateSaleDTO {
  clientTxnId: string
  items: SaleItemInput[]
  customerId?: string
  customerName?: string
  userId: string
  warehouseId?: string
  registerId?: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  paidAmount: number
  paymentMethod: PaymentMethod
  paymentDetails?: Record<string, unknown>
  loyaltyEarned: number
  loyaltyRedeemed: number
  note?: string
}

export interface CreateCustomerDTO {
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  birthday?: string
  tier?: CustomerTier
}

export interface CreateProductDTO {
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
  minStock?: number
  reorderLevel?: number
  trackStock?: boolean
  image?: string
  description?: string
}

// ============================================================
// GENERIC QUERY OPTIONS (Prisma-like, fulfilled by the data client)
// ============================================================

export interface WhereFilter {
  [key: string]: unknown
}

export interface QueryOptions {
  where?: WhereFilter
  limit?: number
  offset?: number
  orderBy?: string
  order?: 'asc' | 'desc'
  select?: string[]
}

export interface DataResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface DataList<T> {
  success: boolean
  data: T[]
  count: number
  error?: string
}
