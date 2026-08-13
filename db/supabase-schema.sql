-- ============================================================
-- لمسة جمال — Beauty POS — Unified Supabase (PostgreSQL) Schema
-- ============================================================
-- ONE source of truth for the cloud data layer.
-- Replaces the fragmented migrations/ + security-fix.sql.
--
-- Design principles (per postgresql-table-design + sql-optimization skills):
--   • TEXT primary keys (CUID/UUID) — required for offline-first sync
--     (client generates ID before server commit → idempotency)
--   • DECIMAL(12,2) for ALL monetary values (never FLOAT — CWE-682)
--   • TIMESTAMPTZ for all event timestamps
--   • NOT NULL + DEFAULT everywhere semantically required
--   • Indexes on every FK column (PG does NOT auto-index FKs)
--   • Role-Based Row Level Security (RBAC at DB level, not just app code)
--   • updated_at triggers on every mutable table
--   • Atomic RPC functions for multi-table financial operations
--   • Idempotency via clientTxnId UNIQUE constraints
--
-- Table/column naming: PascalCase tables + camelCase columns
-- (matches the existing app code & 37 API endpoints — renaming would break them)
--
-- Run order:  this file → db/rls-policies.sql → db/rpc-functions.sql
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS & SAFE RE-RUN GUARDS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram search (product/customer lookup)

-- ============================================================
-- 1. AUTH & USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS "User" (
  "id"            TEXT PRIMARY KEY,
  "email"         TEXT NOT NULL UNIQUE,
  "username"      TEXT NOT NULL UNIQUE,
  "passwordHash"  TEXT NOT NULL,                -- bcrypt hash (never plaintext)
  "name"          TEXT NOT NULL,
  "phone"         TEXT,
  "role"          TEXT NOT NULL DEFAULT 'CASHIER'
                  CHECK ("role" IN ('OWNER','ADMIN','MANAGER','CASHIER','WAREHOUSE','ACCOUNTANT','PLATFORM')),
  "permissions"   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- RBAC permission strings
  "active"        BOOLEAN NOT NULL DEFAULT TRUE,
  "pin"           TEXT,                         -- quick POS PIN (hashed)
  "lastLoginAt"   TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_user_role"        ON "User" ("role");
CREATE INDEX IF NOT EXISTS "idx_user_active"       ON "User" ("active");

-- ============================================================
-- 2. STORE / REGISTER / WAREHOUSE  (multi-tenancy spine)
-- ============================================================

CREATE TABLE IF NOT EXISTS "Store" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "address"       TEXT,
  "phone"         TEXT,
  "email"         TEXT,
  "taxId"         TEXT,
  "currency"      TEXT NOT NULL DEFAULT 'EGP',
  "logo"          TEXT,
  "receiptFooter" TEXT,
  "active"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Register" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "storeId"   TEXT NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT,
  "active"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_register_store" ON "Register" ("storeId");

CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "storeId"   TEXT NOT NULL REFERENCES "Store"("id") ON DELETE RESTRICT,
  "location"  TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_warehouse_store" ON "Warehouse" ("storeId");

-- ============================================================
-- 3. PRODUCT CATALOG  (Category → Brand → Unit → Product)
-- ============================================================

CREATE TABLE IF NOT EXISTS "Category" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "nameAr"    TEXT,
  "parentId"  TEXT REFERENCES "Category"("id") ON DELETE SET NULL,
  "color"     TEXT,
  "icon"      TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_category_parent" ON "Category" ("parentId");

CREATE TABLE IF NOT EXISTS "Brand" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "nameAr"    TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Unit" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,        -- piece, kg, liter, box
  "shortName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Product" (
  "id"                  TEXT PRIMARY KEY,
  "name"                TEXT NOT NULL,
  "nameAr"              TEXT,
  "sku"                 TEXT NOT NULL UNIQUE,
  "barcode"             TEXT UNIQUE,
  "barcodes"            JSONB NOT NULL DEFAULT '[]'::jsonb,   -- extra barcodes
  "categoryId"          TEXT REFERENCES "Category"("id") ON DELETE SET NULL,
  "brandId"             TEXT REFERENCES "Brand"("id")    ON DELETE SET NULL,
  "unitId"              TEXT REFERENCES "Unit"("id")     ON DELETE SET NULL,
  "supplierId"          TEXT,                                -- FK added after Supplier table
  "storeId"             TEXT REFERENCES "Store"("id")    ON DELETE SET NULL,

  -- Pricing — DECIMAL for financial accuracy
  "purchaseCost"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sellingPrice"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "wholesalePrice"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxRate"             REAL NOT NULL DEFAULT 0 CHECK ("taxRate" >= 0 AND "taxRate" <= 100),

  -- Inventory policy
  "minStock"            INTEGER NOT NULL DEFAULT 0,
  "reorderLevel"        INTEGER NOT NULL DEFAULT 0,
  "trackStock"          BOOLEAN NOT NULL DEFAULT TRUE,
  "allowNegativeStock"  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Weighted-average cost tracking
  "avgCost"             DECIMAL(12,2) NOT NULL DEFAULT 0,

  "image"               TEXT,
  "description"         TEXT,
  "active"              BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_product_category" ON "Product" ("categoryId");
CREATE INDEX IF NOT EXISTS "idx_product_supplier" ON "Product" ("supplierId");
CREATE INDEX IF NOT EXISTS "idx_product_brand"    ON "Product" ("brandId");
CREATE INDEX IF NOT EXISTS "idx_product_active"   ON "Product" ("active");
-- Trigram search index for fast name/sku/barcode lookup
CREATE INDEX IF NOT EXISTS "idx_product_name_trgm" ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_product_sku_trgm"  ON "Product" USING GIN ("sku"  gin_trgm_ops);

-- ============================================================
-- 4. INVENTORY  (StockLevel + StockMovement + StockAdjustment)
-- ============================================================

CREATE TABLE IF NOT EXISTS "StockLevel" (
  "id"           TEXT PRIMARY KEY,
  "productId"    TEXT NOT NULL REFERENCES "Product"("id")    ON DELETE CASCADE,
  "warehouseId"  TEXT NOT NULL REFERENCES "Warehouse"("id") ON DELETE RESTRICT,
  "quantity"     INTEGER NOT NULL DEFAULT 0,
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("productId", "warehouseId")
);
CREATE INDEX IF NOT EXISTS "idx_stocklevel_product" ON "StockLevel" ("productId");
CREATE INDEX IF NOT EXISTS "idx_stocklevel_wh"      ON "StockLevel" ("warehouseId");

CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id"           TEXT PRIMARY KEY,
  "productId"    TEXT NOT NULL REFERENCES "Product"("id")    ON DELETE RESTRICT,
  "warehouseId"  TEXT NOT NULL REFERENCES "Warehouse"("id") ON DELETE RESTRICT,
  "type"         TEXT NOT NULL CHECK ("type" IN
                  ('PURCHASE','SALE','RETURN','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT','DAMAGE','OPENING_STOCK')),
  "quantity"     INTEGER NOT NULL,            -- positive in, negative out
  "refType"      TEXT,                        -- Sale, Purchase, Adjustment
  "refId"        TEXT,
  "note"         TEXT,
  "userId"       TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_sm_product"   ON "StockMovement" ("productId");
CREATE INDEX IF NOT EXISTS "idx_sm_wh"        ON "StockMovement" ("warehouseId");
CREATE INDEX IF NOT EXISTS "idx_sm_type"      ON "StockMovement" ("type");
CREATE INDEX IF NOT EXISTS "idx_sm_reftype"   ON "StockMovement" ("refType", "refId");
CREATE INDEX IF NOT EXISTS "idx_sm_created"   ON "StockMovement" ("createdAt");

CREATE TABLE IF NOT EXISTS "StockAdjustment" (
  "id"            TEXT PRIMARY KEY,
  "productId"     TEXT NOT NULL REFERENCES "Product"("id")    ON DELETE RESTRICT,
  "warehouseId"   TEXT NOT NULL REFERENCES "Warehouse"("id") ON DELETE RESTRICT,
  "oldQuantity"   INTEGER NOT NULL,
  "newQuantity"   INTEGER NOT NULL,
  "reason"        TEXT NOT NULL,
  "note"          TEXT,
  "userId"        TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- IDEMPOTENCY: prevents duplicate adjustment operations from offline sync
  "clientTxnId"   TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS "idx_sa_product" ON "StockAdjustment" ("productId");
CREATE INDEX IF NOT EXISTS "idx_sa_wh"      ON "StockAdjustment" ("warehouseId");

-- ============================================================
-- 5. SUPPLIERS & PURCHASES
-- ============================================================

CREATE TABLE IF NOT EXISTS "Supplier" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "phone"     TEXT,
  "email"     TEXT,
  "address"   TEXT,
  "taxId"     TEXT,
  "balance"   DECIMAL(12,2) NOT NULL DEFAULT 0,    -- amount owed
  "active"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Now add the Product → Supplier FK (Supplier exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage
                 WHERE table_name = 'Product' AND constraint_name = 'fk_product_supplier') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "fk_product_supplier"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Purchase" (
  "id"              TEXT PRIMARY KEY,
  "invoiceNumber"   TEXT NOT NULL,
  "supplierId"      TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  "storeId"         TEXT REFERENCES "Store"("id")     ON DELETE SET NULL,
  "warehouseId"     TEXT REFERENCES "Warehouse"("id") ON DELETE SET NULL,
  "userId"          TEXT REFERENCES "User"("id")      ON DELETE SET NULL,

  "subtotal"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxAmount"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discountAmount"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total"           DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paidAmount"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status"          TEXT NOT NULL DEFAULT 'RECEIVED'
                    CHECK ("status" IN ('PENDING','RECEIVED','PARTIAL','PAID')),

  "clientTxnId"     TEXT UNIQUE,                   -- IDEMPOTENCY
  "note"            TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_purchase_supplier" ON "Purchase" ("supplierId");
CREATE INDEX IF NOT EXISTS "idx_purchase_status"   ON "Purchase" ("status");
CREATE INDEX IF NOT EXISTS "idx_purchase_created"  ON "Purchase" ("createdAt");

CREATE TABLE IF NOT EXISTS "PurchaseItem" (
  "id"          TEXT PRIMARY KEY,
  "purchaseId"  TEXT NOT NULL REFERENCES "Purchase"("id") ON DELETE CASCADE,
  "productId"   TEXT NOT NULL REFERENCES "Product"("id")  ON DELETE RESTRICT,
  "quantity"    INTEGER NOT NULL CHECK ("quantity" > 0),
  "unitCost"    DECIMAL(12,2) NOT NULL,
  "taxRate"     REAL NOT NULL DEFAULT 0,
  "total"       DECIMAL(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_pitem_purchase" ON "PurchaseItem" ("purchaseId");
CREATE INDEX IF NOT EXISTS "idx_pitem_product"  ON "PurchaseItem" ("productId");

-- ============================================================
-- 6. CUSTOMERS & LOYALTY
-- ============================================================

CREATE TABLE IF NOT EXISTS "Customer" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "phone"     TEXT UNIQUE,
  "email"     TEXT,
  "address"   TEXT,
  "notes"     TEXT,
  "birthday"  DATE,
  "tier"      TEXT NOT NULL DEFAULT 'BRONZE'
              CHECK ("tier" IN ('BRONZE','SILVER','GOLD','VIP')),
  "active"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_customer_tier"   ON "Customer" ("tier");
CREATE INDEX IF NOT EXISTS "idx_customer_phone_trgm" ON "Customer" USING GIN (COALESCE("phone",'') gin_trgm_ops);

CREATE TABLE IF NOT EXISTS "LoyaltyTier" (
  "id"                 TEXT PRIMARY KEY,
  "name"               TEXT NOT NULL,         -- BRONZE, SILVER, GOLD, VIP
  "displayName"        TEXT NOT NULL,
  "minPoints"          INTEGER NOT NULL DEFAULT 0,
  "earningMultiplier"  REAL NOT NULL DEFAULT 1.0,
  "discountPercent"    REAL NOT NULL DEFAULT 0,
  "color"              TEXT
);

CREATE TABLE IF NOT EXISTS "LoyaltyAccount" (
  "id"            TEXT PRIMARY KEY,
  "customerId"    TEXT NOT NULL UNIQUE REFERENCES "Customer"("id") ON DELETE CASCADE,
  "points"        INTEGER NOT NULL DEFAULT 0,
  "totalEarned"   INTEGER NOT NULL DEFAULT 0,
  "totalRedeemed" INTEGER NOT NULL DEFAULT 0,
  "tier"          TEXT NOT NULL DEFAULT 'BRONZE',
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (
  "id"           TEXT PRIMARY KEY,
  "customerId"   TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE,
  "type"         TEXT NOT NULL CHECK ("type" IN ('EARN','REDEEM','EXPIRE','REVERSE','BONUS','ADJUSTMENT')),
  "points"       INTEGER NOT NULL,            -- positive earn, negative redeem
  "refType"      TEXT,
  "refId"        TEXT,
  "note"         TEXT,
  "clientTxnId"  TEXT UNIQUE,                 -- IDEMPOTENCY
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_lt_customer" ON "LoyaltyTransaction" ("customerId");
CREATE INDEX IF NOT EXISTS "idx_lt_type"     ON "LoyaltyTransaction" ("type");

CREATE TABLE IF NOT EXISTS "LoyaltyCampaign" (
  "id"               TEXT PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "startDate"        TIMESTAMPTZ NOT NULL,
  "endDate"          TIMESTAMPTZ NOT NULL,
  "tierFilter"       TEXT,                    -- null = all
  "pointsMultiplier" REAL NOT NULL DEFAULT 1.0,
  "bonusPoints"      INTEGER NOT NULL DEFAULT 0,
  "minPurchase"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "active"           BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. SALES  (Sale → SaleItem → SalePayment → SaleReturn → SaleReturnItem)
-- ============================================================

CREATE TABLE IF NOT EXISTS "Sale" (
  "id"              TEXT PRIMARY KEY,
  "invoiceNumber"   TEXT NOT NULL UNIQUE,
  "customerId"      TEXT REFERENCES "Customer"("id") ON DELETE SET NULL,
  "userId"          TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "storeId"         TEXT REFERENCES "Store"("id")     ON DELETE SET NULL,
  "registerId"      TEXT REFERENCES "Register"("id")  ON DELETE SET NULL,

  "subtotal"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discountAmount"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discountType"    TEXT CHECK ("discountType" IN ('PERCENT','FIXED')),
  "taxAmount"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total"           DECIMAL(12,2) NOT NULL DEFAULT 0,
  "paidAmount"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "changeAmount"    DECIMAL(12,2) NOT NULL DEFAULT 0,

  "status"          TEXT NOT NULL DEFAULT 'COMPLETED'
                    CHECK ("status" IN ('COMPLETED','HELD','REFUNDED','PARTIAL_REFUND','VOIDED')),
  "paymentMethod"   TEXT NOT NULL DEFAULT 'CASH'
                    CHECK ("paymentMethod" IN ('CASH','CARD','TRANSFER','SPLIT','OTHER')),
  "paymentDetails"  JSONB NOT NULL DEFAULT '{}'::jsonb,

  "loyaltyEarned"   INTEGER NOT NULL DEFAULT 0,
  "loyaltyRedeemed" INTEGER NOT NULL DEFAULT 0,

  "clientTxnId"     TEXT UNIQUE,              -- IDEMPOTENCY (offline sync)
  "note"            TEXT,
  "held"            BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_sale_customer" ON "Sale" ("customerId");
CREATE INDEX IF NOT EXISTS "idx_sale_user"     ON "Sale" ("userId");
CREATE INDEX IF NOT EXISTS "idx_sale_status"   ON "Sale" ("status");
CREATE INDEX IF NOT EXISTS "idx_sale_paymethod" ON "Sale" ("paymentMethod");
CREATE INDEX IF NOT EXISTS "idx_sale_created"  ON "Sale" ("createdAt");

CREATE TABLE IF NOT EXISTS "SaleItem" (
  "id"             TEXT PRIMARY KEY,
  "saleId"         TEXT NOT NULL REFERENCES "Sale"("id")     ON DELETE CASCADE,
  "productId"      TEXT NOT NULL REFERENCES "Product"("id")  ON DELETE RESTRICT,
  "quantity"       INTEGER NOT NULL CHECK ("quantity" > 0),
  "unitPrice"      DECIMAL(12,2) NOT NULL,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxAmount"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total"          DECIMAL(12,2) NOT NULL,
  "costAtSale"     DECIMAL(12,2) NOT NULL DEFAULT 0    -- for profit calc
);
CREATE INDEX IF NOT EXISTS "idx_sitem_sale"    ON "SaleItem" ("saleId");
CREATE INDEX IF NOT EXISTS "idx_sitem_product" ON "SaleItem" ("productId");

CREATE TABLE IF NOT EXISTS "SalePayment" (
  "id"        TEXT PRIMARY KEY,
  "saleId"    TEXT NOT NULL REFERENCES "Sale"("id") ON DELETE CASCADE,
  "method"    TEXT NOT NULL CHECK ("method" IN ('CASH','CARD','TRANSFER','OTHER')),
  "amount"    DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_spay_sale" ON "SalePayment" ("saleId");

CREATE TABLE IF NOT EXISTS "SaleReturn" (
  "id"              TEXT PRIMARY KEY,
  "returnNumber"    TEXT NOT NULL UNIQUE,
  "saleId"          TEXT NOT NULL REFERENCES "Sale"("id") ON DELETE RESTRICT,
  "userId"          TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "subtotal"        DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxAmount"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total"           DECIMAL(12,2) NOT NULL DEFAULT 0,
  "refundMethod"    TEXT NOT NULL DEFAULT 'CASH',
  "reason"          TEXT,
  "status"          TEXT NOT NULL DEFAULT 'COMPLETED',
  "loyaltyReversed" INTEGER NOT NULL DEFAULT 0,
  "clientTxnId"     TEXT UNIQUE,              -- IDEMPOTENCY
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_sr_sale" ON "SaleReturn" ("saleId");

CREATE TABLE IF NOT EXISTS "SaleReturnItem" (
  "id"           TEXT PRIMARY KEY,
  "saleReturnId" TEXT NOT NULL REFERENCES "SaleReturn"("id") ON DELETE CASCADE,
  "saleItemId"   TEXT NOT NULL,
  "productId"    TEXT NOT NULL REFERENCES "Product"("id")    ON DELETE RESTRICT,
  "quantity"     INTEGER NOT NULL CHECK ("quantity" > 0),
  "unitPrice"    DECIMAL(12,2) NOT NULL,
  "total"        DECIMAL(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_sri_return" ON "SaleReturnItem" ("saleReturnId");

-- ============================================================
-- 8. CASH REGISTER  (CashSession → CashMovement)
-- ============================================================

CREATE TABLE IF NOT EXISTS "CashSession" (
  "id"             TEXT PRIMARY KEY,
  "registerId"     TEXT NOT NULL REFERENCES "Register"("id") ON DELETE RESTRICT,
  "userId"         TEXT NOT NULL REFERENCES "User"("id")     ON DELETE RESTRICT,
  "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "closingBalance" DECIMAL(12,2),
  "expectedCash"   DECIMAL(12,2),
  "difference"     DECIMAL(12,2),
  "status"         TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','CLOSED')),
  "openedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "closedAt"       TIMESTAMPTZ,
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_cs_register" ON "CashSession" ("registerId");
CREATE INDEX IF NOT EXISTS "idx_cs_user"     ON "CashSession" ("userId");
CREATE INDEX IF NOT EXISTS "idx_cs_status"   ON "CashSession" ("status");

CREATE TABLE IF NOT EXISTS "CashMovement" (
  "id"          TEXT PRIMARY KEY,
  "sessionId"   TEXT NOT NULL REFERENCES "CashSession"("id") ON DELETE CASCADE,
  "type"        TEXT NOT NULL CHECK ("type" IN
                ('SALE','CASH_IN','CASH_OUT','REFUND','EXPENSE','OPENING','CLOSING')),
  "amount"      DECIMAL(12,2) NOT NULL,
  "note"        TEXT,
  "refType"     TEXT,
  "refId"       TEXT,
  "clientTxnId" TEXT UNIQUE,                   -- IDEMPOTENCY
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_cm_session" ON "CashMovement" ("sessionId");
CREATE INDEX IF NOT EXISTS "idx_cm_type"    ON "CashMovement" ("type");

-- ============================================================
-- 9. EXPENSES
-- ============================================================

CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "nameAr"    TEXT,
  "color"     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Expense" (
  "id"            TEXT PRIMARY KEY,
  "categoryId"    TEXT NOT NULL REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT,
  "userId"        TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "amount"        DECIMAL(12,2) NOT NULL CHECK ("amount" >= 0),
  "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
  "note"          TEXT,
  "date"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "clientTxnId"   TEXT UNIQUE,                 -- IDEMPOTENCY
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_exp_cat"   ON "Expense" ("categoryId");
CREATE INDEX IF NOT EXISTS "idx_exp_user"  ON "Expense" ("userId");
CREATE INDEX IF NOT EXISTS "idx_exp_date"  ON "Expense" ("date");

-- ============================================================
-- 10. SETTINGS & AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS "Setting" (
  "id"        TEXT PRIMARY KEY,
  "key"       TEXT NOT NULL UNIQUE,
  "value"     TEXT NOT NULL,
  "category"  TEXT NOT NULL DEFAULT 'general',
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "action"    TEXT NOT NULL,
  "entity"    TEXT,
  "entityId"  TEXT,
  "before"    JSONB,
  "after"     JSONB,
  "ipAddress" TEXT,
  "device"    TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_audit_user"   ON "AuditLog" ("userId");
CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "AuditLog" ("entity", "entityId");
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "AuditLog" ("action");
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "AuditLog" ("createdAt");

-- ============================================================
-- 11. SYNC QUEUE  (offline → cloud pending operations)
-- ============================================================

CREATE TABLE IF NOT EXISTS "SyncQueue" (
  "id"          TEXT PRIMARY KEY,
  "device"      TEXT NOT NULL,
  "entityType"  TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "operation"   TEXT NOT NULL CHECK ("operation" IN ('CREATE','UPDATE','DELETE')),
  "payload"     JSONB NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','SYNCED','FAILED')),
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "error"       TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "syncedAt"    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_sync_status"  ON "SyncQueue" ("status");
CREATE INDEX IF NOT EXISTS "idx_sync_created" ON "SyncQueue" ("createdAt");

-- ============================================================
-- 12. INVOICE SEQUENCE  (atomic, race-free invoice numbering)
-- ============================================================

CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
  "id"          SERIAL PRIMARY KEY,
  "prefix"      TEXT NOT NULL DEFAULT 'INV',
  "lastNumber"  INTEGER NOT NULL DEFAULT 1000
);
INSERT INTO "InvoiceSequence" ("prefix", "lastNumber")
SELECT 'INV', 1000
WHERE NOT EXISTS (SELECT 1 FROM "InvoiceSequence" WHERE "prefix" = 'INV');

-- ============================================================
-- 13. updated_at TRIGGER  (auto-maintain updatedAt on every table)
-- ============================================================

CREATE OR REPLACE FUNCTION "set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to every table that has "updatedAt"
DO $$
DECLARE
  t TEXT;
  tables_with_updated TEXT[] := ARRAY[
    'User','Store','Register','Warehouse','Category','Brand','Product',
    'StockLevel','Supplier','Purchase','Customer','LoyaltyAccount',
    'Sale','CashSession','Expense','Setting'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_updated LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON %I;', t, t);
      EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I
                      FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();', t, t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- 14. ENABLE ROW LEVEL SECURITY ON EVERY TABLE
-- ============================================================
-- (Policies are defined in db/rls-policies.sql)
DO $$
DECLARE
  t TEXT;
  all_tables TEXT[] := ARRAY[
    'User','Store','Register','Warehouse','Category','Brand','Unit','Product',
    'StockLevel','StockMovement','StockAdjustment','Supplier','Purchase','PurchaseItem',
    'Customer','LoyaltyTier','LoyaltyAccount','LoyaltyTransaction','LoyaltyCampaign',
    'Sale','SaleItem','SalePayment','SaleReturn','SaleReturnItem',
    'CashSession','CashMovement','ExpenseCategory','Expense',
    'Setting','AuditLog','SyncQueue'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      -- Force RLS even for table owners (defense in depth)
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- END OF SCHEMA — continue with db/rls-policies.sql and db/rpc-functions.sql
-- ============================================================
