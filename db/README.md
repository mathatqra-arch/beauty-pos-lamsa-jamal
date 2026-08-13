# لمسة جمال — Data Layer Architecture

> **Unified, secure, modern data foundation** for the Beauty POS system.
> Replaces the fragmented migrations + stub `supabase.ts` with a single
> source of truth for each layer.

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         APPLICATION                              │
│                                                                  │
│   src/lib/data/  ← ONE typed entry point                         │
│   ├── types.ts        entity + DTO types                         │
│   ├── client.ts       unified read/write (auto-routes runtime)   │
│   ├── sync.ts         bidirectional sync engine (idempotent)     │
│   └── index.ts        public barrel                              │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
        ┌───────▼────────┐           ┌────────▼─────────┐
        │   DESKTOP       │           │   WEB / SERVER    │
        │   (Tauri)       │           │   (Next.js)       │
        │                 │           │                   │
        │  SQLite         │           │  Supabase REST    │
        │  (pos.db)       │           │  (PostgREST)      │
        │  ← primary      │           │  ← primary        │
        │  ← offline      │           │                   │
        └───────┬─────────┘           └────────┬──────────┘
                │                              │
                │   Browser PWA (online) →─────┘
                │   Browser PWA (offline) → Dexie/IndexedDB cache
                │
                └─────── sync engine pushes queue when online ────→
```

### Three runtimes, one API

| Runtime | Primary store | Sync target |
|---------|---------------|-------------|
| **Server** (Next.js API) | Supabase (PostgREST) | — (it IS the server) |
| **Desktop** (Tauri) | SQLite `pos.db` | Supabase (background) |
| **Browser** (PWA) | Dexie/IndexedDB (cache) | `/api/*` → Supabase |

`src/lib/data/client.ts` detects the runtime automatically and routes
every call to the right backend. No more `if (isDesktop) {...}` scattered
across the app.

---

## 📁 Files

### Cloud layer (Supabase / PostgreSQL)

| File | Purpose |
|------|---------|
| `db/supabase-schema.sql` | All tables, types, indexes, `updated_at` triggers, RLS enable. **Run first.** |
| `db/rls-policies.sql` | Role-Based RLS (OWNER/ADMIN/MANAGER/CASHIER/WAREHOUSE/ACCOUNTANT/PLATFORM). **Run second.** |
| `db/rpc-functions.sql` | Atomic `create_sale_atomic`, `create_sale_return_atomic`, `create_purchase_atomic` + `next_invoice_number`. **Run third.** |

### Local layer (SQLite / Tauri desktop)

| File | Purpose |
|------|---------|
| `db/sqlite-schema.sql` | Unified SQLite schema (mirrors Supabase), triggers, `PRAGMA foreign_keys`. Applied by Tauri migration system. |

### Type-safe access

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Prisma schema (SQLite for dev). Source of truth for types + `prisma db push`. |
| `prisma/seed.ts` | Fresh, secure seed (bcrypt-hashed passwords, 72 products, 20 customers). |
| `src/lib/data/types.ts` | Shared TypeScript entity + DTO types. |
| `src/lib/data/client.ts` | Unified data client (auto-routes server/desktop/browser). |
| `src/lib/data/sync.ts` | Clean bidirectional sync engine with idempotency. |

### Legacy (archived, do not use)

`migrations/legacy/` — the old fragmented migration files + `security-fix.sql`.
Kept for reference only. The new `db/*.sql` files supersede them.

---

## 🔐 Security

### Row Level Security (role-based)

Every table has RLS **enabled + forced**. The `anon` role (exposed in client
code) gets **zero** access. Policies are role-aware:

| Role | Reads | Writes |
|------|-------|--------|
| OWNER, ADMIN | everything | everything (management tier) |
| MANAGER | everything | products, sales, purchases, cash, reports |
| CASHIER | all (own sales + master data) | sales, cash, customers |
| WAREHOUSE | inventory, purchases | stock, purchases |
| ACCOUNTANT | expenses, reports, audit | expenses |
| PLATFORM | monitoring only | lock system |
| **anon** | **nothing** | **nothing** |

### Passwords

All seed passwords are **bcrypt-hashed** (10 rounds). Never plaintext.
The old `admin/admin123` style is gone.

| Username | Password | Role |
|----------|----------|------|
| `admin` | `Admin@Lamsa2026` | OWNER |
| `manager` | `Manager@Lamsa2026` | MANAGER |
| `cashier` | `Cashier@Lamsa2026` | CASHIER (PIN `1234`) |
| `platform` | `Platform@Lamsa2026` | PLATFORM |

> ⚠️ Rotate these in production via the Settings → Users UI.

### Idempotency

Every financial write carries a `clientTxnId` (UUID):
- Generated client-side **before** the request
- Stored as `UNIQUE` on the target table
- The RPC functions check `clientTxnId` first — if it exists, they return
  the existing row. **Retries from the sync engine never duplicate.**

### Atomic transactions

`create_sale_atomic`, `create_sale_return_atomic`, `create_purchase_atomic`
run as `SECURITY DEFINER` PL/pgSQL functions — the sale + items + payments
+ stock movements + loyalty + cash movement + audit log all commit in a
single DB transaction, or all roll back. **No partial sales possible.**

Stock deduction uses `SELECT ... FOR UPDATE` row locking — **no overselling**
under concurrent sales.

### Money

- **Supabase**: `DECIMAL(12,2)` (exact decimal — never FLOAT, CWE-682)
- **SQLite**: `REAL` (IEEE 754 double) — the JS layer (`round2()`) rounds
  to 2 decimals on every read/write. For absolute precision, migrate to
  INTEGER cents (future work).

---

## 🚀 Setup

### Local dev (SQLite via Prisma)

```bash
bun install
cp .env.example .env          # fill in DATABASE_URL (already set to file:./db/dev.db)
bun run db:push               # create SQLite DB from prisma/schema.prisma
bun run prisma/seed.ts        # seed fresh secure data
bun run dev                   # http://localhost:3000
```

### Cloud (Supabase) — fresh setup OR existing project

> If you already have a Supabase project with old data, **reset it first**
> (see "Resetting an existing Supabase project" below).

1. Create a project at [supabase.com](https://supabase.com) (or use existing)
2. In SQL Editor, run the files **in this exact order**:
   - **(only if resetting)** `db/supabase-wipe.sql` — drops the whole public schema
   - `db/supabase-schema.sql` — tables + indexes + triggers + RLS enable
   - `db/rls-policies.sql` — role-based RLS policies
   - `db/rpc-functions.sql` — atomic sale/purchase/return RPCs
3. Copy URL + anon key + service_role key into `.env` (see below)
4. The app now syncs local ↔ cloud automatically

### Resetting an existing Supabase project (DESTROYS ALL DATA)

If you have an old Supabase project with leftover tables/policies from the
previous fragmented schema, wipe it clean before running the new schema:

```sql
-- In Supabase SQL Editor:
-- 1. Run db/supabase-wipe.sql  → drops the entire public schema (CASCADE)
-- 2. Run db/supabase-schema.sql
-- 3. Run db/rls-policies.sql
-- 4. Run db/rpc-functions.sql
```

`supabase-wipe.sql` drops the public schema (all tables, functions, triggers,
policies, sequences) and recreates it empty with proper grants. It leaves
`auth.*`, `storage.*`, and Supabase-managed extensions untouched. There is
**no undo** — export your data first if you need it.

### Desktop (Tauri)

The Tauri Rust migration system applies `db/sqlite-schema.sql` before
`Database.load()` returns. SQLite is the primary store in desktop mode;
the sync engine pushes to Supabase in the background when online.

---

## 🔄 Sync engine

`src/lib/data/sync.ts` runs every 15s when online:

1. **PUSH** — drains `syncQueue` (PENDING items) → server with
   `X-Client-Txn-Id` header. Marks SYNCED or increments attempts
   (FAILED after `maxAttempts`).
2. **PULL** — fetches products + sales since `sync.lastSync`:
   - Master data (products): `last-write-wins` (updatedAt)
   - Transactions (sales): `append-only` (never overwrite)

Skips entirely in desktop mode (desktop has its own SQLite-primary sync).

---

## 📊 Data model summary

30+ tables across 10 domains:

| Domain | Tables |
|--------|--------|
| Auth | `User` |
| Tenancy | `Store`, `Register`, `Warehouse` |
| Catalog | `Category`, `Brand`, `Unit`, `Product` |
| Inventory | `StockLevel`, `StockMovement`, `StockAdjustment` |
| Purchases | `Supplier`, `Purchase`, `PurchaseItem` |
| Customers | `Customer`, `LoyaltyTier`, `LoyaltyAccount`, `LoyaltyTransaction`, `LoyaltyCampaign` |
| Sales | `Sale`, `SaleItem`, `SalePayment`, `SaleReturn`, `SaleReturnItem` |
| Cash | `CashSession`, `CashMovement` |
| Expenses | `ExpenseCategory`, `Expense` |
| System | `Setting`, `AuditLog`, `SyncQueue`, `InvoiceSequence` |
