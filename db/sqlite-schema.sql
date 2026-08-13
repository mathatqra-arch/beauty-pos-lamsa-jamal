-- ============================================================
-- لمسة جمال — Unified SQLite Schema (Desktop / Offline)
-- ============================================================
-- ONE source of truth for the local data layer (Tauri desktop app).
-- Mirrors the Supabase schema but uses SQLite-native types & idioms.
--
-- Design principles (per sqlite-database-expert skill):
--   • TEXT primary keys (CUID/UUID) — offline-first sync requires
--     client-generated IDs (idempotency)
--   • Money stored as REAL — SQLite has no native DECIMAL. The JS layer
--     rounds to 2 decimals on every read/write. For absolute precision,
--     migrate to INTEGER cents (see note in db/README.md).
--   • TEXT 'true'/'false' for booleans — SQLite has no native BOOL;
--     the app code already reads/writes these as strings (migration 005).
--   • 'created_at'/'updated_at' TEXT (ISO-8601) with triggers
--   • FOREIGN KEY enforcement via PRAGMA foreign_keys = ON (Rust-side)
--   • Triggers auto-maintain updated_at
--   • Idempotency via UNIQUE client_txn_id columns
--
-- Table naming: lowercase snake_case (SQLite convention, matches the
-- existing Tauri desktop schema that migrations built up).
--
-- Applied by the Tauri migration system before Database.load() returns.
-- ============================================================

PRAGMA journal_mode = WAL;        -- concurrent readers + one writer
PRAGMA foreign_keys = ON;         -- enforce FK constraints
PRAGMA busy_timeout = 5000;       -- wait 5s on lock contention

-- ============================================================
-- 1. AUTH & USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'CASHIER'
                CHECK (role IN ('OWNER','ADMIN','MANAGER','CASHIER','WAREHOUSE','ACCOUNTANT','PLATFORM')),
  permissions   TEXT NOT NULL DEFAULT '[]',     -- JSON array
  active        TEXT NOT NULL DEFAULT 'true',   -- 'true'/'false'
  pin           TEXT,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role    ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_active  ON users (active);

-- ============================================================
-- 2. STORE / REGISTER / WAREHOUSE
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  address        TEXT,
  phone          TEXT,
  email          TEXT,
  tax_id         TEXT,
  currency       TEXT NOT NULL DEFAULT 'EGP',
  logo           TEXT,
  receipt_footer TEXT,
  active         TEXT NOT NULL DEFAULT 'true',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS registers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  active     TEXT NOT NULL DEFAULT 'true',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_registers_store ON registers (store_id);

CREATE TABLE IF NOT EXISTS warehouses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  location   TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_warehouses_store ON warehouses (store_id);

-- ============================================================
-- 3. PRODUCT CATALOG
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_ar    TEXT,
  parent_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
  color      TEXT,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);

CREATE TABLE IF NOT EXISTS brands (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_ar    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS units (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  name_ar             TEXT,
  sku                 TEXT NOT NULL UNIQUE,
  barcode             TEXT UNIQUE,
  barcodes            TEXT NOT NULL DEFAULT '[]',   -- JSON array
  category_id         TEXT REFERENCES categories(id) ON DELETE SET NULL,
  brand_id            TEXT REFERENCES brands(id)    ON DELETE SET NULL,
  unit_id             TEXT REFERENCES units(id)     ON DELETE SET NULL,
  supplier_id         TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  store_id            TEXT REFERENCES stores(id)    ON DELETE SET NULL,

  -- Pricing (REAL — JS rounds to 2 decimals)
  purchase_cost       REAL NOT NULL DEFAULT 0,
  selling_price       REAL NOT NULL DEFAULT 0,
  wholesale_price     REAL NOT NULL DEFAULT 0,
  tax_rate            REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),

  -- Inventory policy
  min_stock           INTEGER NOT NULL DEFAULT 0,
  reorder_level       INTEGER NOT NULL DEFAULT 0,
  track_stock         TEXT NOT NULL DEFAULT 'true',
  allow_negative_stock TEXT NOT NULL DEFAULT 'false',

  -- Weighted-average cost
  avg_cost            REAL NOT NULL DEFAULT 0,

  image               TEXT,
  description         TEXT,
  active              TEXT NOT NULL DEFAULT 'true',

  -- Local-only: denormalized current stock for fast POS lookups
  current_stock       INTEGER NOT NULL DEFAULT 0,
  sync_status         TEXT NOT NULL DEFAULT 'synced',  -- synced|pending|updated|deleted
  pending_stock_delta INTEGER NOT NULL DEFAULT 0,
  last_synced         INTEGER NOT NULL DEFAULT 0,      -- epoch ms

  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products (supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_brand    ON products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products (active);
CREATE INDEX IF NOT EXISTS idx_products_sync     ON products (sync_status);

-- ============================================================
-- 4. INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_levels (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  quantity     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (product_id, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_stocklevels_product ON stock_levels (product_id);
CREATE INDEX IF NOT EXISTS idx_stocklevels_wh      ON stock_levels (warehouse_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id           TEXT PRIMARY KEY,
  client_txn_id TEXT UNIQUE,                         -- IDEMPOTENCY
  product_id   TEXT NOT NULL REFERENCES products(id)    ON DELETE RESTRICT,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  type         TEXT NOT NULL CHECK (type IN
               ('PURCHASE','SALE','RETURN','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT','DAMAGE','OPENING_STOCK')),
  quantity     INTEGER NOT NULL,
  ref_type     TEXT,
  ref_id       TEXT,
  note         TEXT,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status  TEXT NOT NULL DEFAULT 'synced'
);
CREATE INDEX IF NOT EXISTS idx_sm_product ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_sm_wh      ON stock_movements (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sm_type    ON stock_movements (type);
CREATE INDEX IF NOT EXISTS idx_sm_created ON stock_movements (created_at);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id             TEXT PRIMARY KEY,
  client_txn_id  TEXT UNIQUE,                        -- IDEMPOTENCY
  product_id     TEXT NOT NULL REFERENCES products(id)    ON DELETE RESTRICT,
  warehouse_id   TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  old_quantity   INTEGER NOT NULL,
  new_quantity   INTEGER NOT NULL,
  reason         TEXT NOT NULL,
  note           TEXT,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sa_product ON stock_adjustments (product_id);

-- ============================================================
-- 5. SUPPLIERS & PURCHASES
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  tax_id     TEXT,
  balance    REAL NOT NULL DEFAULT 0,
  active     TEXT NOT NULL DEFAULT 'true',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id              TEXT PRIMARY KEY,
  client_txn_id   TEXT UNIQUE,                       -- IDEMPOTENCY
  invoice_number  TEXT NOT NULL,
  supplier_id     TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  store_id        TEXT REFERENCES stores(id)     ON DELETE SET NULL,
  warehouse_id    TEXT REFERENCES warehouses(id) ON DELETE SET NULL,
  user_id         TEXT REFERENCES users(id)      ON DELETE SET NULL,
  subtotal        REAL NOT NULL DEFAULT 0,
  tax_amount      REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  paid_amount     REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'RECEIVED'
                  CHECK (status IN ('PENDING','RECEIVED','PARTIAL','PAID')),
  note            TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'synced',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status   ON purchases (status);

CREATE TABLE IF NOT EXISTS purchase_items (
  id          TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id)  ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost   REAL NOT NULL,
  tax_rate    REAL NOT NULL DEFAULT 0,
  total       REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pitems_purchase ON purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_pitems_product  ON purchase_items (product_id);

-- ============================================================
-- 6. CUSTOMERS & LOYALTY
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT UNIQUE,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  birthday   TEXT,         -- ISO date
  tier       TEXT NOT NULL DEFAULT 'BRONZE'
             CHECK (tier IN ('BRONZE','SILVER','GOLD','VIP')),
  active     TEXT NOT NULL DEFAULT 'true',
  -- Denormalized loyalty (for fast POS display)
  loyalty_points   INTEGER NOT NULL DEFAULT 0,
  total_earned     INTEGER NOT NULL DEFAULT 0,
  total_redeemed   INTEGER NOT NULL DEFAULT 0,
  last_synced      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_tier   ON customers (tier);
CREATE INDEX IF NOT EXISTS idx_customers_phone  ON customers (phone);

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  min_points         INTEGER NOT NULL DEFAULT 0,
  earning_multiplier REAL NOT NULL DEFAULT 1.0,
  discount_percent   REAL NOT NULL DEFAULT 0,
  color              TEXT
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  points        INTEGER NOT NULL DEFAULT 0,
  total_earned  INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  tier          TEXT NOT NULL DEFAULT 'BRONZE',
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id             TEXT PRIMARY KEY,
  client_txn_id  TEXT UNIQUE,                        -- IDEMPOTENCY
  customer_id    TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('EARN','REDEEM','EXPIRE','REVERSE','BONUS','ADJUSTMENT')),
  points         INTEGER NOT NULL,
  ref_type       TEXT,
  ref_id         TEXT,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status    TEXT NOT NULL DEFAULT 'synced'
);
CREATE INDEX IF NOT EXISTS idx_lt_customer ON loyalty_transactions (customer_id);
CREATE INDEX IF NOT EXISTS idx_lt_type     ON loyalty_transactions (type);

CREATE TABLE IF NOT EXISTS loyalty_campaigns (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT,
  start_date         TEXT NOT NULL,
  end_date           TEXT NOT NULL,
  tier_filter        TEXT,
  points_multiplier  REAL NOT NULL DEFAULT 1.0,
  bonus_points       INTEGER NOT NULL DEFAULT 0,
  min_purchase       REAL NOT NULL DEFAULT 0,
  active             TEXT NOT NULL DEFAULT 'true',
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================
-- 7. SALES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id              TEXT PRIMARY KEY,
  client_txn_id   TEXT UNIQUE,                       -- IDEMPOTENCY (== id)
  invoice_number  TEXT NOT NULL UNIQUE,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   TEXT,                              -- denormalized for offline receipts
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  store_id        TEXT REFERENCES stores(id)     ON DELETE SET NULL,
  register_id     TEXT REFERENCES registers(id)  ON DELETE SET NULL,

  subtotal        REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  discount_type   TEXT CHECK (discount_type IN ('PERCENT','FIXED')),
  tax_amount      REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  paid_amount     REAL NOT NULL DEFAULT 0,
  change_amount   REAL NOT NULL DEFAULT 0,

  status          TEXT NOT NULL DEFAULT 'COMPLETED'
                  CHECK (status IN ('COMPLETED','HELD','REFUNDED','PARTIAL_REFUND','VOIDED')),
  payment_method  TEXT NOT NULL DEFAULT 'CASH'
                  CHECK (payment_method IN ('CASH','CARD','TRANSFER','SPLIT','OTHER')),
  payment_details TEXT NOT NULL DEFAULT '{}',         -- JSON

  loyalty_earned   INTEGER NOT NULL DEFAULT 0,
  loyalty_redeemed INTEGER NOT NULL DEFAULT 0,

  note            TEXT,
  held            TEXT NOT NULL DEFAULT 'false',
  sync_status     TEXT NOT NULL DEFAULT 'pending',    -- pending|synced|failed
  sync_attempts   INTEGER NOT NULL DEFAULT 0,
  sync_error      TEXT,
  last_synced_at  INTEGER,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_user     ON sales (user_id);
CREATE INDEX IF NOT EXISTS idx_sales_status   ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_created  ON sales (created_at);
CREATE INDEX IF NOT EXISTS idx_sales_sync     ON sales (sync_status);

-- Sale items stored as JSON blob for offline atomicity + fast receipt rebuild.
-- (The cloud SaleItem table is the normalized source of truth; the local
--  sales.items blob is a denormalized cache for offline POS.)
-- Note: a normalized sale_items table also exists for synced rows.
CREATE TABLE IF NOT EXISTS sale_items (
  id           TEXT PRIMARY KEY,
  sale_id      TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT,                                 -- denormalized snapshot
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_amount   REAL NOT NULL DEFAULT 0,
  total        REAL NOT NULL,
  cost_at_sale REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sitems_sale    ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sitems_product ON sale_items (product_id);

CREATE TABLE IF NOT EXISTS sale_payments (
  id         TEXT PRIMARY KEY,
  sale_id    TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('CASH','CARD','TRANSFER','OTHER')),
  amount     REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_spay_sale ON sale_payments (sale_id);

CREATE TABLE IF NOT EXISTS sale_returns (
  id               TEXT PRIMARY KEY,
  client_txn_id    TEXT UNIQUE,                      -- IDEMPOTENCY
  return_number    TEXT NOT NULL UNIQUE,
  sale_id          TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subtotal         REAL NOT NULL DEFAULT 0,
  tax_amount       REAL NOT NULL DEFAULT 0,
  total            REAL NOT NULL DEFAULT 0,
  refund_method    TEXT NOT NULL DEFAULT 'CASH',
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'COMPLETED',
  loyalty_reversed INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status      TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_sreturns_sale ON sale_returns (sale_id);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id            TEXT PRIMARY KEY,
  sale_return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id  TEXT NOT NULL,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    REAL NOT NULL,
  total         REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sri_return ON sale_return_items (sale_return_id);

-- ============================================================
-- 8. CASH REGISTER
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_sessions (
  id              TEXT PRIMARY KEY,
  register_id     TEXT NOT NULL REFERENCES registers(id) ON DELETE RESTRICT,
  user_id         TEXT NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
  opening_balance REAL NOT NULL DEFAULT 0,
  closing_balance REAL,
  expected_cash   REAL,
  difference      REAL,
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  opened_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at       TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_cs_register ON cash_sessions (register_id);
CREATE INDEX IF NOT EXISTS idx_cs_status   ON cash_sessions (status);

CREATE TABLE IF NOT EXISTS cash_movements (
  id            TEXT PRIMARY KEY,
  client_txn_id TEXT UNIQUE,                         -- IDEMPOTENCY
  session_id    TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN
                ('SALE','CASH_IN','CASH_OUT','REFUND','EXPENSE','OPENING','CLOSING')),
  amount        REAL NOT NULL,
  note          TEXT,
  ref_type      TEXT,
  ref_id        TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status   TEXT NOT NULL DEFAULT 'synced'
);
CREATE INDEX IF NOT EXISTS idx_cm_session ON cash_movements (session_id);
CREATE INDEX IF NOT EXISTS idx_cm_type    ON cash_movements (type);

-- ============================================================
-- 9. EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_ar    TEXT,
  color      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id             TEXT PRIMARY KEY,
  client_txn_id  TEXT UNIQUE,                        -- IDEMPOTENCY
  category_id    TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount         REAL NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'CASH',
  note           TEXT,
  date           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sync_status    TEXT NOT NULL DEFAULT 'synced'
);
CREATE INDEX IF NOT EXISTS idx_exp_cat  ON expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_exp_date ON expenses (date);

-- ============================================================
-- 10. SETTINGS & AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'general',
  last_synced INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  before     TEXT,        -- JSON
  after      TEXT,        -- JSON
  ip_address TEXT,
  device     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);

-- ============================================================
-- 11. SYNC QUEUE  (offline → cloud pending operations)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  client_txn_id TEXT NOT NULL,                       -- IDEMPOTENCY KEY
  operation   TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
  payload     TEXT NOT NULL,                          -- JSON
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SYNCED','FAILED')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  error       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  synced_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_syncq_status  ON sync_queue (status);
CREATE INDEX IF NOT EXISTS idx_syncq_created ON sync_queue (created_at);

-- ============================================================
-- 12. INVOICE SEQUENCE  (atomic numbering — SQLite UPSERT pattern)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_sequences (
  prefix       TEXT PRIMARY KEY DEFAULT 'INV',
  last_number  INTEGER NOT NULL DEFAULT 1000
);
INSERT OR IGNORE INTO invoice_sequences (prefix, last_number) VALUES ('INV', 1000);
INSERT OR IGNORE INTO invoice_sequences (prefix, last_number) VALUES ('RET', 1);

-- ============================================================
-- 13. updated_at TRIGGER  (auto-maintain updated_at)
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_users_updated
  AFTER UPDATE ON users FOR EACH ROW
  BEGIN
    UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_products_updated
  AFTER UPDATE ON products FOR EACH ROW
  BEGIN
    UPDATE products SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_customers_updated
  AFTER UPDATE ON customers FOR EACH ROW
  BEGIN
    UPDATE customers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_sales_updated
  AFTER UPDATE ON sales FOR EACH ROW
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE sales SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_suppliers_updated
  AFTER UPDATE ON suppliers FOR EACH ROW
  BEGIN
    UPDATE suppliers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_purchases_updated
  AFTER UPDATE ON purchases FOR EACH ROW
  BEGIN
    UPDATE purchases SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
  END;

-- ============================================================
-- 14. STOCK DEDUCTION TRIGGER (auto-update products.current_stock)
--     When a stock_movement is inserted, keep the denormalized
--     products.current_stock in sync for fast POS lookups.
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_stockmovement_update_product
  AFTER INSERT ON stock_movements
  FOR EACH ROW
  BEGIN
    UPDATE products
      SET current_stock = (
        SELECT COALESCE(SUM(quantity), 0) FROM stock_movements
        WHERE product_id = NEW.product_id
      )
      WHERE id = NEW.product_id;
  END;

-- ============================================================
-- END OF SQLITE SCHEMA
-- ============================================================
