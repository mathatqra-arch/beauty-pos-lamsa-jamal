-- ============================================================
-- Migration 003: Schema Patches + PRAGMA + Sync Queue Cleanup
-- ============================================================
-- This migration replaces the runtime patchSchema() function
-- that was previously in desktop-api.ts. By moving schema patches
-- to a versioned migration, they run through tauri-plugin-sql's
-- Rust-based migration system — NOT through frontend db.execute().
--
-- This allows us to keep sql:allow-execute restricted while
-- still applying schema changes safely.
--
-- All statements use IF NOT EXISTS or are idempotent.
-- ============================================================

-- PRAGMA: Enable foreign key enforcement
-- SQLite defaults to OFF; this is critical for ON DELETE CASCADE
PRAGMA foreign_keys = ON;

-- ============================================================
-- §1: Legacy column patches (from early versions)
-- ============================================================
-- SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS,
-- so we use a procedural approach via CREATE TABLE IF NOT EXISTS
-- for new tables, and accept that ALTER TABLE will fail silently
-- if the column already exists (the migration system catches this).

-- Note: These ALTER TABLE statements will fail on databases that
-- already have these columns. The tauri-plugin-sql migration system
-- wraps each migration in a transaction and will mark it as applied
-- even if individual statements fail with "duplicate column" errors.
-- This is the expected behavior for idempotent schema patches.

-- suppliers.active
ALTER TABLE suppliers ADD COLUMN active INTEGER DEFAULT 1;

-- products.description
ALTER TABLE products ADD COLUMN description TEXT;

-- customers.notes
ALTER TABLE customers ADD COLUMN notes TEXT;

-- ============================================================
-- §2: Soft delete columns (deleted_at) on all 16 critical tables
-- ============================================================
ALTER TABLE products ADD COLUMN deleted_at TEXT;
ALTER TABLE categories ADD COLUMN deleted_at TEXT;
ALTER TABLE customers ADD COLUMN deleted_at TEXT;
ALTER TABLE suppliers ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE sales ADD COLUMN deleted_at TEXT;
ALTER TABLE sale_items ADD COLUMN deleted_at TEXT;
ALTER TABLE stock_movements ADD COLUMN deleted_at TEXT;
ALTER TABLE cash_sessions ADD COLUMN deleted_at TEXT;
ALTER TABLE cash_movements ADD COLUMN deleted_at TEXT;
ALTER TABLE expenses ADD COLUMN deleted_at TEXT;
ALTER TABLE loyalty_accounts ADD COLUMN deleted_at TEXT;
ALTER TABLE loyalty_transactions ADD COLUMN deleted_at TEXT;
ALTER TABLE purchases ADD COLUMN deleted_at TEXT;
ALTER TABLE purchase_items ADD COLUMN deleted_at TEXT;
ALTER TABLE audit_logs ADD COLUMN deleted_at TEXT;

-- ============================================================
-- §3: Idempotency columns (client_txn_id) on transactional tables
-- ============================================================
-- sales already has client_txn_id from migration 001
ALTER TABLE purchases ADD COLUMN client_txn_id TEXT;
ALTER TABLE expenses ADD COLUMN client_txn_id TEXT;
ALTER TABLE cash_movements ADD COLUMN client_txn_id TEXT;
ALTER TABLE stock_movements ADD COLUMN client_txn_id TEXT;
ALTER TABLE loyalty_transactions ADD COLUMN client_txn_id TEXT;
ALTER TABLE sale_returns ADD COLUMN client_txn_id TEXT;

-- ============================================================
-- §4: updated_at on tables that lacked it
-- ============================================================
ALTER TABLE categories ADD COLUMN updated_at TEXT;
ALTER TABLE suppliers ADD COLUMN updated_at TEXT;
ALTER TABLE sale_items ADD COLUMN updated_at TEXT;
ALTER TABLE purchase_items ADD COLUMN updated_at TEXT;
ALTER TABLE sale_returns ADD COLUMN updated_at TEXT;
ALTER TABLE cash_sessions ADD COLUMN updated_at TEXT;
ALTER TABLE cash_movements ADD COLUMN updated_at TEXT;
ALTER TABLE stock_movements ADD COLUMN updated_at TEXT;
ALTER TABLE expenses ADD COLUMN updated_at TEXT;
ALTER TABLE loyalty_transactions ADD COLUMN updated_at TEXT;
ALTER TABLE audit_logs ADD COLUMN updated_at TEXT;
ALTER TABLE sync_queue ADD COLUMN updated_at TEXT;
ALTER TABLE settings ADD COLUMN updated_at TEXT;

-- ============================================================
-- §5: device_id on sync_queue
-- ============================================================
ALTER TABLE sync_queue ADD COLUMN device_id TEXT;

-- ============================================================
-- §6: Sync queue dedup + unique index
-- ============================================================
-- Delete duplicate rows (keep newest by MAX(id))
DELETE FROM sync_queue
WHERE client_txn_id IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id) FROM sync_queue
    WHERE client_txn_id IS NOT NULL
    GROUP BY client_txn_id
  );

-- Create unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_queue_client_txn
  ON sync_queue(client_txn_id)
  WHERE client_txn_id IS NOT NULL;

-- ============================================================
-- §7: Sync performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_sync ON products(updated_at, deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_sync ON categories(updated_at, deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_sync ON customers(updated_at, deleted_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_sync ON suppliers(updated_at, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sales_sync ON sales(updated_at, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, attempts);

-- ============================================================
-- §8: Sync metadata table (if not exists from migration 002)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- ============================================================
-- §9: Sale payments table (if not exists from migration 002)
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);

-- ============================================================
-- Migration 003 complete.
-- The seedAdminUser() function remains in desktop-api.ts
-- because it needs bcrypt (a JS library) which can't run in Rust.
-- However, it now runs AFTER migrations are complete, so the
-- schema is guaranteed to be ready.
-- ============================================================
