import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  getSessionUser,
  successResponse,
  errorResponse,
  type SessionUser,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/sync/push
// ------------------------------------------------------------
// Receives a batch of sync operations from a Desktop client and
// applies them to Supabase. Each operation carries a `clientTxnId`
// that acts as an idempotency key — if a previous push with the
// same `clientTxnId` has already been executed, the cached result
// is returned without re-executing the operation.
//
// Body:
//   {
//     deviceId: string,
//     operations: SyncOperation[]
//   }
//
// Response:
//   {
//     success: true,
//     data: {
//       results: SyncResult[],
//       pushed: number,
//       failed: number
//     }
//   }
// ============================================================

// ---------- Types ----------

type EntityType =
  | 'Sale'
  | 'Customer'
  | 'Product'
  | 'Expense'
  | 'Purchase'
  | 'CashSession'
  | 'CashMovement'
  | 'StockMovement'
  | 'LoyaltyTransaction'

type OperationType = 'CREATE' | 'UPDATE' | 'DELETE'

interface SyncOperationInput {
  clientTxnId: string
  entityType: EntityType
  operation: OperationType
  entityId?: string
  data: Record<string, unknown>
  /** Optional nested items for compound entities (Sale/Purchase). */
  items?: Array<Record<string, unknown>>
  /** Optional payments array for Sale operations. */
  payments?: Array<Record<string, unknown>>
}

interface SyncResult {
  clientTxnId: string
  success: boolean
  entityId?: string
  error?: string
  /** True if the result was returned from the idempotency cache. */
  idempotent?: boolean
}

interface PushRequestBody {
  deviceId: string
  operations: SyncOperationInput[]
}

// ---------- Idempotency helpers ----------
//
// The idempotency layer uses the `SyncOperation` table on Supabase.
// If that table does not exist (or any error occurs while reading
// it), we gracefully fall back to entity-level idempotency — i.e.
// each handler checks whether an entity with the same id already
// exists before creating it.

async function findExistingOp(
  clientTxnId: string,
): Promise<SyncResult | null> {
  try {
    const rec = await db.syncOperation.findUnique({
      where: { clientTxnId },
    })
    if (!rec) return null
    const raw = rec.result as string | null
    if (!raw) return null
    const parsed = JSON.parse(raw) as SyncResult
    // Mark as idempotent so the client knows it was a cached hit
    return { ...parsed, idempotent: true }
  } catch {
    // Table missing or malformed record — treat as no prior op
    return null
  }
}

async function recordOp(
  clientTxnId: string,
  entityType: string,
  entityId: string,
  result: SyncResult,
  deviceId: string,
): Promise<void> {
  try {
    await db.syncOperation.create({
      data: {
        id: randomUUID(),
        clientTxnId,
        entityType,
        entityId,
        deviceId,
        result: JSON.stringify(result),
      },
    })
  } catch (e) {
    // Non-fatal: idempotency table may not exist on this Supabase
    console.warn(
      '[sync/push] could not record idempotency for',
      clientTxnId,
      '—',
      (e as Error).message,
    )
  }
}

// ---------- Utility helpers ----------

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : fallback
}

function int(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : (v as number)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function str(v: unknown): string
function str(v: unknown, fallback: string): string
function str(v: unknown, fallback: null): string | null
function str(v: unknown, fallback: string | null = ''): string | null {
  if (typeof v === 'string') return v
  if (v == null) return fallback
  return String(v)
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

// ============================================================
// ENTITY HANDLERS
// ============================================================

// ---------- Sale ----------
// Mirrors the logic in /api/sales POST but is tolerant of the
// desktop client already having computed totals. If totals are
// missing, they are recomputed from items + product prices.
async function handleSale(
  op: SyncOperationInput,
  user: SessionUser,
): Promise<SyncResult> {
  const saleId = op.entityId || op.clientTxnId
  const data = op.data || {}

  // Entity-level idempotency: if the sale already exists with this
  // id (because the desktop client reused the same clientTxnId),
  // return it without re-creating.
  try {
    const existing = await db.sale.findUnique({ where: { id: saleId } })
    if (existing) {
      return {
        clientTxnId: op.clientTxnId,
        success: true,
        entityId: saleId,
        idempotent: true,
      }
    }
  } catch {
    /* ignore — fall through to create */
  }

  const items = Array.isArray(op.items) ? op.items : []
  if (items.length === 0) {
    return {
      clientTxnId: op.clientTxnId,
      success: false,
      error: 'لا توجد أصناف في الفاتورة',
    }
  }

  const userId = user.id  // SECURITY: from session only, ignore body.userId
  const customerId = str(data.customerId, '') || null
  const paymentMethod = str(data.paymentMethod, 'CASH')

  // Resolve warehouse (auto-find first if not specified)
  let warehouseId = str(data.warehouseId, '')
  if (!warehouseId) {
    const warehouse = await db.warehouse.findFirst()
    if (!warehouse) {
      return {
        clientTxnId: op.clientTxnId,
        success: false,
        error: 'لا يوجد مخزن في النظام',
      }
    }
    warehouseId = warehouse.id
  }

  // Validate items & compute totals if not pre-computed
  let subtotal = num(data.subtotal)
  let taxAmount = num(data.taxAmount)
  const itemsData: Array<Record<string, unknown>> = []

  for (const item of items) {
    const productId = str(item.productId)
    if (!productId) {
      return {
        clientTxnId: op.clientTxnId,
        success: false,
        error: 'معرّف المنتج مفقود في أحد الأصناف',
      }
    }
    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) {
      return {
        clientTxnId: op.clientTxnId,
        success: false,
        error: `المنتج غير موجود: ${productId}`,
      }
    }

    const quantity = int(item.quantity)
    const unitPrice = num(item.unitPrice, product.sellingPrice as number)
    const lineTotal = unitPrice * quantity
    const lineTax = num(item.taxAmount, lineTotal * ((product.taxRate as number) / 100))

    if (subtotal === 0 && taxAmount === 0) {
      subtotal += lineTotal
      taxAmount += lineTax
    }

    itemsData.push({
      id: randomUUID(),
      saleId,
      productId,
      quantity,
      unitPrice,
      discountAmount: num(item.discountAmount),
      taxAmount: lineTax,
      total: lineTotal + lineTax,
      costAtSale: num(item.costAtSale, product.avgCost ?? product.purchaseCost),
    })
  }

  const discountAmount = num(data.discountAmount)
  const total = num(data.total, subtotal - discountAmount + taxAmount)
  const paidAmount = num(data.paidAmount, total)
  const changeAmount = Math.max(0, paidAmount - total)
  const loyaltyEarned = int(data.loyaltyEarned)
  const loyaltyRedeemed = num(data.loyaltyRedeemed)

  // Loyalty earn recompute if not supplied
  let computedLoyaltyEarned = loyaltyEarned
  if (customerId && loyaltyEarned === 0 && loyaltyRedeemed === 0) {
    try {
      const setting = await db.setting.findUnique({
        where: { key: 'loyalty.pointsPerEgp' },
      })
      const rate = setting ? parseFloat(setting.value as string) : 0.1
      computedLoyaltyEarned = Math.floor(total * rate)
    } catch {
      computedLoyaltyEarned = 0
    }
  }

  const invoiceNumber = str(data.invoiceNumber, `INV-${Date.now()}`)

  // 1. Create the sale
  await db.sale.create({
    data: {
      id: saleId,
      invoiceNumber,
      customerId,
      userId,
      subtotal,
      discountAmount,
      discountType: str(data.discountType, null),
      taxAmount,
      total,
      paidAmount,
      changeAmount,
      status: str(data.status, 'COMPLETED'),
      paymentMethod,
      paymentDetails: JSON.stringify(data.paymentDetails || {}),
      loyaltyEarned: computedLoyaltyEarned,
      loyaltyRedeemed: int(loyaltyRedeemed),
      note: str(data.note, null) || null,
      held: bool(data.held, false),
    },
  })

  // 2. Sale items + stock deduction + stock movement
  for (const item of itemsData) {
    await db.saleItem.create({ data: item })

    const productId = item.productId as string
    const quantity = item.quantity as number

    const stockLevel = await db.stockLevel.findFirst({
      where: { productId, warehouseId },
    })
    if (stockLevel) {
      // CRITICAL FIX: check stock before deducting (prevents overselling from offline sync)
      if ((stockLevel.quantity as number) < quantity) {
        // Rollback: delete the sale and items we just created
        await db.saleItem.deleteMany({ where: { saleId } }).catch(() => {})
        await db.sale.delete({ where: { id: saleId } }).catch(() => {})
        return {
          clientTxnId: op.clientTxnId,
          success: false,
          error: `insufficient_stock: ${productId} (available: ${stockLevel.quantity}, requested: ${quantity})`,
        }
      }
      try {
        await db.stockLevel.update({
          where: { id: stockLevel.id },
          data: { quantity: (stockLevel.quantity as number) - quantity },
        })
      } catch {
        /* ignore stock update failures */
      }
    }

    await db.stockMovement.create({
      data: {
        id: randomUUID(),
        productId,
        warehouseId,
        type: 'SALE',
        quantity: -quantity,
        refType: 'Sale',
        refId: saleId,
      },
    })
  }

  // 3. Payment record (single-method; multi-method payments are
  //    sent through `payments` array when the client uses SPLIT)
  const payments =
    Array.isArray(op.payments) && op.payments.length > 0
      ? op.payments
      : [{ method: paymentMethod, amount: total }]
  for (const p of payments) {
    await db.salePayment.create({
      data: {
        id: randomUUID(),
        saleId,
        method: str(p.method, paymentMethod),
        amount: num(p.amount, total),
      },
    })
  }

  // 4. Loyalty: award points to the customer's account
  if (customerId && computedLoyaltyEarned > 0) {
    try {
      const acct = await db.loyaltyAccount.findUnique({
        where: { customerId },
      })
      if (acct) {
        await db.loyaltyAccount.update({
          where: { customerId },
          data: {
            points: (acct.points as number) + computedLoyaltyEarned,
            totalEarned: (acct.totalEarned as number) + computedLoyaltyEarned,
          },
        })
      } else {
        await db.loyaltyAccount.create({
          data: {
            id: randomUUID(),
            customerId,
            points: computedLoyaltyEarned,
            totalEarned: computedLoyaltyEarned,
            tier: 'BRONZE',
          },
        })
      }
      await db.loyaltyTransaction.create({
        data: {
          id: randomUUID(),
          customerId,
          type: 'EARN',
          points: computedLoyaltyEarned,
          refType: 'Sale',
          refId: saleId,
          note: `نقاط من ${invoiceNumber}`,
        },
      })
    } catch (e) {
      // Loyalty failure should not fail the sale
      console.warn('[sync/push] loyalty error:', (e as Error).message)
    }
  }

  // 5. Cash movement for CASH sales
  if (paymentMethod === 'CASH') {
    try {
      const session = await db.cashSession.findFirst({
        where: { status: 'OPEN' },
      })
      if (session) {
        await db.cashMovement.create({
          data: {
            id: randomUUID(),
            sessionId: session.id,
            type: 'SALE',
            amount: total,
            refType: 'Sale',
            refId: saleId,
            note: invoiceNumber,
          },
        })
      }
    } catch {
      /* ignore */
    }
  }

  // 6. Audit log
  try {
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'SALE_CREATED',
        entity: 'Sale',
        entityId: saleId,
        after: JSON.stringify({ invoiceNumber, total }),
      },
    })
  } catch {
    /* ignore */
  }

  return {
    clientTxnId: op.clientTxnId,
    success: true,
    entityId: saleId,
  }
}

// ---------- Customer ----------
async function handleCustomer(op: SyncOperationInput): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()

  if (op.operation === 'CREATE') {
    // Entity-level idempotency
    try {
      const existing = await db.customer.findUnique({
        where: { id: entityId },
      })
      if (existing) {
        return {
          clientTxnId: op.clientTxnId,
          success: true,
          entityId,
          idempotent: true,
        }
      }
    } catch {
      /* ignore */
    }

    const created = await db.customer.create({
      data: {
        id: entityId,
        name: str(data.name),
        phone: str(data.phone, null) || null,
        email: str(data.email, null) || null,
        address: str(data.address, null) || null,
        notes: str(data.notes, null) || null,
        birthday: data.birthday ? new Date(str(data.birthday)) : null,
        tier: str(data.tier, 'BRONZE'),
        active: bool(data.active, true),
      },
    })
    // Auto-create loyalty account
    try {
      await db.loyaltyAccount.create({
        data: {
          id: randomUUID(),
          customerId: created.id,
          points: int(data.loyaltyPoints),
          totalEarned: int(data.totalEarned),
          totalRedeemed: int(data.totalRedeemed),
          tier: str(data.tier, 'BRONZE'),
        },
      })
    } catch {
      /* loyalty account may already exist */
    }
    return { clientTxnId: op.clientTxnId, success: true, entityId }
  }

  if (op.operation === 'UPDATE') {
    await db.customer.update({
      where: { id: entityId },
      data: {
        name: str(data.name) || undefined,
        phone: str(data.phone, null) || null,
        email: str(data.email, null) || null,
        address: str(data.address, null) || null,
        notes: str(data.notes, null) || null,
        tier: str(data.tier) || undefined,
        active: bool(data.active, true),
      },
    })
    return { clientTxnId: op.clientTxnId, success: true, entityId }
  }

  // DELETE — soft delete via `active = false`
  await db.customer.update({
    where: { id: entityId },
    data: { active: false },
  })
  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ---------- Product ----------
async function handleProduct(op: SyncOperationInput): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()

  if (op.operation === 'CREATE') {
    try {
      const existing = await db.product.findUnique({
        where: { id: entityId },
      })
      if (existing) {
        return {
          clientTxnId: op.clientTxnId,
          success: true,
          entityId,
          idempotent: true,
        }
      }
    } catch {
      /* ignore */
    }

    await db.product.create({
      data: {
        id: entityId,
        name: str(data.name),
        nameAr: str(data.nameAr, null) || null,
        sku: str(data.sku),
        barcode: str(data.barcode, null) || null,
        barcodes: str(data.barcodes, '[]'),
        categoryId: str(data.categoryId, null) || null,
        brandId: str(data.brandId, null) || null,
        unitId: str(data.unitId, null) || null,
        supplierId: str(data.supplierId, null) || null,
        storeId: str(data.storeId, null) || null,
        purchaseCost: num(data.purchaseCost),
        sellingPrice: num(data.sellingPrice),
        wholesalePrice: num(data.wholesalePrice),
        taxRate: num(data.taxRate),
        minStock: int(data.minStock),
        reorderLevel: int(data.reorderLevel),
        trackStock: bool(data.trackStock, true),
        allowNegativeStock: bool(data.allowNegativeStock, false),
        avgCost: num(data.avgCost, num(data.purchaseCost)),
        image: str(data.image, null) || null,
        description: str(data.description, null) || null,
        active: bool(data.active, true),
      },
    })

    // Opening stock (optional)
    const openingStock = int(data.openingStock)
    if (openingStock > 0) {
      let warehouseId = str(data.warehouseId, '')
      if (!warehouseId) {
        const warehouse = await db.warehouse.findFirst()
        warehouseId = warehouse?.id || ''
      }
      if (warehouseId) {
        try {
          await db.stockLevel.create({
            data: {
              id: randomUUID(),
              productId: entityId,
              warehouseId,
              quantity: openingStock,
            },
          })
          await db.stockMovement.create({
            data: {
              id: randomUUID(),
              productId: entityId,
              warehouseId,
              type: 'OPENING_STOCK',
              quantity: openingStock,
              refType: 'Opening',
            },
          })
        } catch {
          /* ignore */
        }
      }
    }
    return { clientTxnId: op.clientTxnId, success: true, entityId }
  }

  if (op.operation === 'UPDATE') {
    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = str(data.name)
    if (data.nameAr !== undefined) updateData.nameAr = str(data.nameAr, null) || null
    if (data.sku !== undefined) updateData.sku = str(data.sku)
    if (data.barcode !== undefined) updateData.barcode = str(data.barcode, null) || null
    if (data.categoryId !== undefined) updateData.categoryId = str(data.categoryId, null) || null
    if (data.purchaseCost !== undefined) updateData.purchaseCost = num(data.purchaseCost)
    if (data.sellingPrice !== undefined) updateData.sellingPrice = num(data.sellingPrice)
    if (data.wholesalePrice !== undefined) updateData.wholesalePrice = num(data.wholesalePrice)
    if (data.taxRate !== undefined) updateData.taxRate = num(data.taxRate)
    if (data.minStock !== undefined) updateData.minStock = int(data.minStock)
    if (data.reorderLevel !== undefined) updateData.reorderLevel = int(data.reorderLevel)
    if (data.active !== undefined) updateData.active = bool(data.active, true)
    if (data.image !== undefined) updateData.image = str(data.image, null) || null
    if (data.description !== undefined) updateData.description = str(data.description, null) || null

    await db.product.update({ where: { id: entityId }, data: updateData })
    return { clientTxnId: op.clientTxnId, success: true, entityId }
  }

  // DELETE — soft delete via `active = false`
  await db.product.update({
    where: { id: entityId },
    data: { active: false },
  })
  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ---------- Expense ----------
async function handleExpense(
  op: SyncOperationInput,
  user: SessionUser,
): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()
  const userId = user.id  // SECURITY: from session only, ignore body.userId
  const method = str(data.paymentMethod, 'CASH')

  // Idempotency
  try {
    const existing = await db.expense.findUnique({
      where: { id: entityId },
    })
    if (existing) {
      return {
        clientTxnId: op.clientTxnId,
        success: true,
        entityId,
        idempotent: true,
      }
    }
  } catch {
    /* ignore */
  }

  const amount = num(data.amount)
  if (amount <= 0) {
    return {
      clientTxnId: op.clientTxnId,
      success: false,
      error: 'المبلغ يجب أن يكون أكبر من صفر',
    }
  }

  const expenseDate = data.date ? new Date(str(data.date)) : new Date()

  await db.expense.create({
    data: {
      id: entityId,
      categoryId: str(data.categoryId),
      userId,
      amount,
      paymentMethod: method,
      note: str(data.note, null) || null,
      date: expenseDate,
    },
  })

  // CASH expense → record cash movement in open session
  if (method === 'CASH') {
    try {
      const session = await db.cashSession.findFirst({
        where: { status: 'OPEN' },
      })
      if (session) {
        await db.cashMovement.create({
          data: {
            id: randomUUID(),
            sessionId: session.id,
            type: 'EXPENSE',
            amount,
            refType: 'Expense',
            refId: entityId,
            note: str(data.note, '') || 'مصروف نقدي',
          },
        })
      }
    } catch {
      /* ignore */
    }
  }

  try {
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'EXPENSE_CREATED',
        entity: 'Expense',
        entityId,
        after: JSON.stringify({ amount, categoryId: data.categoryId, method }),
      },
    })
  } catch {
    /* ignore */
  }

  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ---------- Purchase ----------
async function handlePurchase(
  op: SyncOperationInput,
  user: SessionUser,
): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()
  const userId = user.id  // SECURITY: from session only, ignore body.userId
  const supplierId = str(data.supplierId)

  // Idempotency
  try {
    const existing = await db.purchase.findUnique({
      where: { id: entityId },
    })
    if (existing) {
      return {
        clientTxnId: op.clientTxnId,
        success: true,
        entityId,
        idempotent: true,
      }
    }
  } catch {
    /* ignore */
  }

  if (!supplierId) {
    return {
      clientTxnId: op.clientTxnId,
      success: false,
      error: 'المورد مطلوب',
    }
  }
  const items = Array.isArray(op.items) ? op.items : []
  if (items.length === 0) {
    return {
      clientTxnId: op.clientTxnId,
      success: false,
      error: 'الأصناف مطلوبة',
    }
  }

  let warehouseId = str(data.warehouseId, '')
  if (!warehouseId) {
    const warehouse = await db.warehouse.findFirst()
    if (!warehouse) {
      return {
        clientTxnId: op.clientTxnId,
        success: false,
        error: 'لا يوجد مخزن في النظام',
      }
    }
    warehouseId = warehouse.id
  }

  // Compute totals if not pre-supplied
  let subtotal = num(data.subtotal)
  if (subtotal === 0) {
    for (const item of items) {
      subtotal += int(item.quantity) * num(item.unitCost)
    }
  }
  const tax = num(data.taxAmount)
  const discount = num(data.discountAmount)
  const total = num(data.total, subtotal + tax - discount)
  const paid = num(data.paidAmount)
  const balance = total - paid
  const status = str(
    data.status,
    paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'RECEIVED',
  )
  const invoiceNumber = str(data.invoiceNumber, `PUR-${Date.now()}`)

  await db.purchase.create({
    data: {
      id: entityId,
      invoiceNumber,
      supplierId,
      warehouseId,
      userId,
      subtotal,
      taxAmount: tax,
      discountAmount: discount,
      total,
      paidAmount: paid,
      status,
      note: str(data.note, null) || null,
    },
  })

  // Purchase items + stock updates + movements + avg cost
  for (const item of items) {
    const productId = str(item.productId)
    const quantity = int(item.quantity)
    const unitCost = num(item.unitCost)
    const lineTotal = num(item.total, quantity * unitCost)

    const purchaseItemId = randomUUID()
    await db.purchaseItem.create({
      data: {
        id: purchaseItemId,
        purchaseId: entityId,
        productId,
        quantity,
        unitCost,
        taxRate: num(item.taxRate),
        total: lineTotal,
      },
    })

    // Weighted average cost
    const product = await db.product.findUnique({
      where: { id: productId },
    })
    if (product) {
      const oldStock = (product as Record<string, unknown>).currentStock as number | undefined
      const oldAvg = (product.avgCost as number) || 0
      const oldQty = typeof oldStock === 'number' ? oldStock : 0
      const newAvg =
        oldQty + quantity > 0
          ? (oldQty * oldAvg + quantity * unitCost) / (oldQty + quantity)
          : unitCost

      // Upsert stock level
      const existingLevel = await db.stockLevel.findFirst({
        where: { productId, warehouseId },
      })
      if (existingLevel) {
        try {
          await db.stockLevel.update({
            where: { id: existingLevel.id },
            data: {
              quantity: (existingLevel.quantity as number) + quantity,
            },
          })
        } catch {
          /* ignore */
        }
      } else {
        await db.stockLevel.create({
          data: {
            id: randomUUID(),
            productId,
            warehouseId,
            quantity,
          },
        })
      }

      await db.product.update({
        where: { id: productId },
        data: { avgCost: newAvg, purchaseCost: unitCost },
      })
    }

    await db.stockMovement.create({
      data: {
        id: randomUUID(),
        productId,
        warehouseId,
        type: 'PURCHASE',
        quantity,
        refType: 'Purchase',
        refId: entityId,
        note: `فاتورة شراء ${invoiceNumber}`,
        userId,
      },
    })
  }

  // Update supplier balance if not fully paid
  if (balance > 0) {
    try {
      const supplier = await db.supplier.findUnique({
        where: { id: supplierId },
      })
      if (supplier) {
        await db.supplier.update({
          where: { id: supplierId },
          data: {
            balance: (supplier.balance as number) + balance,
          },
        })
      }
    } catch {
      /* ignore */
    }
  }

  try {
    await db.auditLog.create({
      data: {
        id: randomUUID(),
        userId,
        action: 'PURCHASE_CREATED',
        entity: 'Purchase',
        entityId,
        after: JSON.stringify({ invoiceNumber, total, status }),
      },
    })
  } catch {
    /* ignore */
  }

  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ---------- CashSession ----------
async function handleCashSession(
  op: SyncOperationInput,
  user: SessionUser,
): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()
  const userId = user.id  // SECURITY: from session only, ignore body.userId

  try {
    const existing = await db.cashSession.findUnique({
      where: { id: entityId },
    })
    if (existing) {
      return {
        clientTxnId: op.clientTxnId,
        success: true,
        entityId,
        idempotent: true,
      }
    }
  } catch {
    /* ignore */
  }

  let registerId = str(data.registerId, '')
  if (!registerId) {
    const register = await db.register.findFirst()
    registerId = register?.id || ''
  }

  await db.cashSession.create({
    data: {
      id: entityId,
      registerId,
      userId,
      openingBalance: num(data.openingBalance),
      status: str(data.status, 'OPEN'),
      openedAt: data.openedAt ? new Date(str(data.openedAt)) : new Date(),
      closedAt: data.closedAt ? new Date(str(data.closedAt)) : null,
      closingBalance: data.closingBalance != null ? num(data.closingBalance) : null,
      expectedCash: data.expectedCash != null ? num(data.expectedCash) : null,
      difference: data.difference != null ? num(data.difference) : null,
    },
  })

  // OPENING movement
  if (num(data.openingBalance) > 0) {
    try {
      await db.cashMovement.create({
        data: {
          id: randomUUID(),
          sessionId: entityId,
          type: 'OPENING',
          amount: num(data.openingBalance),
          note: 'افتتاح الخزنة',
        },
      })
    } catch {
      /* ignore */
    }
  }

  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ---------- CashMovement ----------
async function handleCashMovement(
  op: SyncOperationInput,
): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()

  try {
    const existing = await db.cashMovement.findUnique({
      where: { id: entityId },
    })
    if (existing) {
      return {
        clientTxnId: op.clientTxnId,
        success: true,
        entityId,
        idempotent: true,
      }
    }
  } catch {
    /* ignore */
  }

  await db.cashMovement.create({
    data: {
      id: entityId,
      sessionId: str(data.sessionId),
      type: str(data.type, 'CASH_IN'),
      amount: num(data.amount),
      note: str(data.note, null) || null,
      refType: str(data.refType, null) || null,
      refId: str(data.refId, null) || null,
    },
  })
  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ---------- StockMovement ----------
async function handleStockMovement(
  op: SyncOperationInput,
  user: SessionUser,
): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()

  try {
    const existing = await db.stockMovement.findUnique({
      where: { id: entityId },
    })
    if (existing) {
      return {
        clientTxnId: op.clientTxnId,
        success: true,
        entityId,
        idempotent: true,
      }
    }
  } catch {
    /* ignore */
  }

  const productId = str(data.productId)
  let warehouseId = str(data.warehouseId, '')
  if (!warehouseId) {
    const warehouse = await db.warehouse.findFirst()
    warehouseId = warehouse?.id || ''
  }

  await db.stockMovement.create({
    data: {
      id: entityId,
      productId,
      warehouseId,
      type: str(data.type, 'ADJUSTMENT'),
      quantity: int(data.quantity),
      refType: str(data.refType, null) || null,
      refId: str(data.refId, null) || null,
      note: str(data.note, null) || null,
      userId: user.id,  // SECURITY: from session only
    },
  })

  // Update stock level for the product (add the movement quantity)
  if (warehouseId) {
    const existingLevel = await db.stockLevel.findFirst({
      where: { productId, warehouseId },
    })
    if (existingLevel) {
      try {
        await db.stockLevel.update({
          where: { id: existingLevel.id },
          data: {
            quantity:
              (existingLevel.quantity as number) + int(data.quantity),
          },
        })
      } catch {
        /* ignore */
      }
    } else {
      await db.stockLevel.create({
        data: {
          id: randomUUID(),
          productId,
          warehouseId,
          quantity: int(data.quantity),
        },
      })
    }
  }

  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ---------- LoyaltyTransaction ----------
async function handleLoyaltyTransaction(
  op: SyncOperationInput,
): Promise<SyncResult> {
  const data = op.data || {}
  const entityId = op.entityId || str(data.id) || randomUUID()

  try {
    const existing = await db.loyaltyTransaction.findUnique({
      where: { id: entityId },
    })
    if (existing) {
      return {
        clientTxnId: op.clientTxnId,
        success: true,
        entityId,
        idempotent: true,
      }
    }
  } catch {
    /* ignore */
  }

  const customerId = str(data.customerId)
  const points = int(data.points)
  const type = str(data.type, 'EARN')

  await db.loyaltyTransaction.create({
    data: {
      id: entityId,
      customerId,
      type,
      points,
      refType: str(data.refType, null) || null,
      refId: str(data.refId, null) || null,
      note: str(data.note, null) || null,
    },
  })

  // Update loyalty account balance
  try {
    const acct = await db.loyaltyAccount.findUnique({
      where: { customerId },
    })
    if (acct) {
      const delta = type === 'REDEEM' ? -Math.abs(points) : Math.abs(points)
      await db.loyaltyAccount.update({
        where: { customerId },
        data: {
          points: (acct.points as number) + delta,
          totalEarned:
            type === 'EARN' || type === 'BONUS'
              ? (acct.totalEarned as number) + Math.abs(points)
              : (acct.totalEarned as number),
          totalRedeemed:
            type === 'REDEEM'
              ? (acct.totalRedeemed as number) + Math.abs(points)
              : (acct.totalRedeemed as number),
        },
      })
    }
  } catch {
    /* ignore */
  }

  return { clientTxnId: op.clientTxnId, success: true, entityId }
}

// ============================================================
// DISPATCHER
// ============================================================

async function executeOperation(
  op: SyncOperationInput,
  user: SessionUser,
): Promise<SyncResult> {
  // 1. Check the idempotency cache first
  const cached = await findExistingOp(op.clientTxnId)
  if (cached) return cached

  // 2. Dispatch by entity type
  let result: SyncResult
  try {
    switch (op.entityType) {
      case 'Sale':
        result = await handleSale(op, user)
        break
      case 'Customer':
        result = await handleCustomer(op)
        break
      case 'Product':
        result = await handleProduct(op)
        break
      case 'Expense':
        result = await handleExpense(op, user)
        break
      case 'Purchase':
        result = await handlePurchase(op, user)
        break
      case 'CashSession':
        result = await handleCashSession(op, user)
        break
      case 'CashMovement':
        result = await handleCashMovement(op)
        break
      case 'StockMovement':
        result = await handleStockMovement(op, user)
        break
      case 'LoyaltyTransaction':
        result = await handleLoyaltyTransaction(op)
        break
      default:
        result = {
          clientTxnId: op.clientTxnId,
          success: false,
          error: `نوع كيان غير مدعوم: ${op.entityType}`,
        }
    }
  } catch (e) {
    result = {
      clientTxnId: op.clientTxnId,
      success: false,
      error: (e as Error).message || 'خطأ غير معروف',
    }
  }

  // 3. Record the result for future idempotency (best-effort)
  if (result.success && result.entityId) {
    await recordOp(
      op.clientTxnId,
      op.entityType,
      result.entityId,
      result,
      str(op.data?.deviceId, ''),
    )
  }

  return result
}

// ============================================================
// POST handler
// ============================================================

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication required
    const user = await getSessionUser(req)
    if (!user) {
      return errorResponse('غير مصرح — يجب تسجيل الدخول', 401)
    }

    // 2. Parse body
    let body: PushRequestBody
    try {
      body = (await req.json()) as PushRequestBody
    } catch {
      return errorResponse('جسم الطلب غير صالح (JSON متوقع)', 400)
    }

    if (!body || typeof body !== 'object') {
      return errorResponse('جسم الطلب مفقود', 400)
    }
    if (!body.deviceId || typeof body.deviceId !== 'string') {
      return errorResponse('deviceId مطلوب', 400)
    }
    if (!Array.isArray(body.operations)) {
      return errorResponse('operations يجب أن تكون مصفوفة', 400)
    }

    // 3. Honor the X-Client-Txn-Id header at the batch level — if the
    //    same batch is replayed, return the cached results for each
    //    operation (handled per-operation by `findExistingOp`).

    // 4. Execute operations sequentially
    const results: SyncResult[] = []
    for (const op of body.operations) {
      if (!op || !op.clientTxnId || !op.entityType) {
        results.push({
          clientTxnId: op?.clientTxnId || '',
          success: false,
          error: 'عملية غير مكتملة (clientTxnId/entityType مفقود)',
        })
        continue
      }
      const r = await executeOperation(op, user)
      results.push(r)
    }

    const pushed = results.filter((r) => r.success).length
    const failed = results.length - pushed

    return successResponse(
      { results, pushed, failed },
      `تمت معالجة ${results.length} عملية (${pushed} ناجحة، ${failed} فاشلة)`,
    )
  } catch (e) {
    console.error('[sync/push] fatal error:', e)
    return errorResponse(
      (e as Error).message || 'خطأ داخلي في معالجة دفعة المزامنة',
      500,
    )
  }
}
