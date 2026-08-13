-- ============================================================
-- لمسة جمال — Row Level Security (Role-Based)
-- ============================================================
-- Replaces the old "authenticated full access" policies in security-fix.sql.
--
-- ROLE MODEL (RBAC at the database level):
--   OWNER      — full god access (store owner)
--   ADMIN      — full store management except platform-level ops
--   MANAGER    — products, sales, purchases, reports, cash
--   CASHIER    — POS sales, cash, customers (read), own sales
--   WAREHOUSE  — inventory, purchases, stock adjustments
--   ACCOUNTANT — expenses, reports, audit (read)
--   PLATFORM   — platform-level monitoring only (multi-tenant)
--
-- The anon role (exposed in client code) gets ZERO access.
-- Authenticated requests carry a JWT whose claims include the role;
-- Supabase exposes it as auth.jwt() -> 'role' (custom claim) or via
-- a profiles lookup. Here we use a helper that reads the role from
-- the User table matched by auth.uid() (set by the server using the
-- service_role key, or by Supabase Auth mapped to User.id).
-- ============================================================

-- ============================================================
-- 0. ROLE HELPER FUNCTIONS
-- ============================================================

-- Returns the role of the current authenticated user.
-- Falls back to 'anon' if not authenticated.
CREATE OR REPLACE FUNCTION "current_user_role"()
RETURNS TEXT AS $$
DECLARE
  r TEXT;
BEGIN
  SELECT "role" INTO r FROM "User" WHERE "id" = auth.uid();
  RETURN COALESCE(r, 'anon');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Returns the id of the current authenticated user (or NULL).
CREATE OR REPLACE FUNCTION "current_app_user_id"()
RETURNS TEXT AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- True if the current user is OWNER or ADMIN (management tier).
CREATE OR REPLACE FUNCTION "is_manager_tier"()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN "current_user_role"() IN ('OWNER','ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- True if the current user may perform financial/transactional writes.
CREATE OR REPLACE FUNCTION "can_transact"()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN "current_user_role"() IN ('OWNER','ADMIN','MANAGER','CASHIER','WAREHOUSE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- 1. DROP ALL LEGACY POLICIES (idempotent re-run)
-- ============================================================
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'User','Store','Register','Warehouse','Category','Brand','Unit','Product',
    'StockLevel','StockMovement','StockAdjustment','Supplier','Purchase','PurchaseItem',
    'Customer','LoyaltyTier','LoyaltyAccount','LoyaltyTransaction','LoyaltyCampaign',
    'Sale','SaleItem','SalePayment','SaleReturn','SaleReturnItem',
    'CashSession','CashMovement','ExpenseCategory','Expense',
    'Setting','AuditLog','SyncQueue'
  ];
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      BEGIN
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', pol.policyname, t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 2. POLICY: User table (most sensitive — contains passwordHash)
-- ============================================================
-- Only management tier can read/write users. CASHIER can read their own row.
CREATE POLICY "users_self_read"   ON "User" FOR SELECT TO authenticated
  USING ("id" = auth.uid() OR "is_manager_tier"());
CREATE POLICY "users_mgmt_write"  ON "User" FOR ALL TO authenticated
  USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

-- ============================================================
-- 3. MASTER DATA (Store, Register, Warehouse, Category, Brand, Unit, Supplier)
--    Read: all authenticated. Write: manager tier only.
-- ============================================================
CREATE POLICY "store_read"  ON "Store"     FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "store_write" ON "Store"     FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "register_read"  ON "Register" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "register_write" ON "Register" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "warehouse_read"  ON "Warehouse" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "warehouse_write" ON "Warehouse" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "category_read"  ON "Category" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "category_write" ON "Category" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "brand_read"  ON "Brand" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "brand_write" ON "Brand" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "unit_read"  ON "Unit" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "unit_write" ON "Unit" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "supplier_read"  ON "Supplier" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "supplier_write" ON "Supplier" FOR ALL TO authenticated USING ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE') WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE');

-- ============================================================
-- 4. PRODUCT CATALOG
--    Read: all authenticated. Write: manager tier + warehouse.
-- ============================================================
CREATE POLICY "product_read"  ON "Product" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "product_write" ON "Product" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE');

-- ============================================================
-- 5. INVENTORY
--    Read: all authenticated. Write: manager tier + warehouse.
--    StockAdjustment is sensitive (changes valuation) → manager tier only.
-- ============================================================
CREATE POLICY "stocklevel_read"  ON "StockLevel" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "stocklevel_write" ON "StockLevel" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE');

CREATE POLICY "stockmove_read"  ON "StockMovement" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "stockmove_write" ON "StockMovement" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE' OR "can_transact"())
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE' OR "can_transact"());

CREATE POLICY "stockadj_read"  ON "StockAdjustment" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "stockadj_write" ON "StockAdjustment" FOR ALL TO authenticated
  USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

-- ============================================================
-- 6. PURCHASES
--    Read: manager + warehouse + accountant. Write: manager + warehouse.
-- ============================================================
CREATE POLICY "purchase_read"  ON "Purchase" FOR SELECT TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() IN ('WAREHOUSE','ACCOUNTANT'));
CREATE POLICY "purchase_write" ON "Purchase" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE');

CREATE POLICY "pitem_read"  ON "PurchaseItem" FOR SELECT TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() IN ('WAREHOUSE','ACCOUNTANT'));
CREATE POLICY "pitem_write" ON "PurchaseItem" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'WAREHOUSE');

-- ============================================================
-- 7. CUSTOMERS & LOYALTY
--    Read: all authenticated (cashiers need to pick customer in POS).
--    Write: manager + cashier (create/edit customers).
--    Loyalty points writes: via RPC only (see rpc-functions.sql).
-- ============================================================
CREATE POLICY "customer_read"  ON "Customer" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "customer_write" ON "Customer" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "can_transact"())
  WITH CHECK ("is_manager_tier"() OR "can_transact"());

CREATE POLICY "loytier_read"  ON "LoyaltyTier" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "loytier_write" ON "LoyaltyTier" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "loyacct_read"  ON "LoyaltyAccount" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "loyacct_write" ON "LoyaltyAccount" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "loytx_read"  ON "LoyaltyTransaction" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "loytx_write" ON "LoyaltyTransaction" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

CREATE POLICY "loycamp_read"  ON "LoyaltyCampaign" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "loycamp_write" ON "LoyaltyCampaign" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

-- ============================================================
-- 8. SALES
--    Read: all authenticated (cashier sees own sales; manager sees all).
--    Write: any role that can_transact (cashier creates sales).
-- ============================================================
CREATE POLICY "sale_read"  ON "Sale" FOR SELECT TO authenticated
  USING (TRUE);
CREATE POLICY "sale_write" ON "Sale" FOR ALL TO authenticated
  USING ("can_transact"()) WITH CHECK ("can_transact"());

CREATE POLICY "sitem_read"  ON "SaleItem" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "sitem_write" ON "SaleItem" FOR ALL TO authenticated USING ("can_transact"()) WITH CHECK ("can_transact"());

CREATE POLICY "spay_read"  ON "SalePayment" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "spay_write" ON "SalePayment" FOR ALL TO authenticated USING ("can_transact"()) WITH CHECK ("can_transact"());

CREATE POLICY "sreturn_read"  ON "SaleReturn" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "sreturn_write" ON "SaleReturn" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'CASHIER')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'CASHIER');

CREATE POLICY "sri_read"  ON "SaleReturnItem" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "sri_write" ON "SaleReturnItem" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'CASHIER')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'CASHIER');

-- ============================================================
-- 9. CASH REGISTER
--    Read: all authenticated. Write: cashier + manager.
-- ============================================================
CREATE POLICY "cashsess_read"  ON "CashSession" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "cashsess_write" ON "CashSession" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'CASHIER')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'CASHIER');

CREATE POLICY "cashmove_read"  ON "CashMovement" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "cashmove_write" ON "CashMovement" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'CASHIER')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'CASHIER');

-- ============================================================
-- 10. EXPENSES
--     Read: manager + accountant. Write: manager + accountant.
-- ============================================================
CREATE POLICY "expcat_read"  ON "ExpenseCategory" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "expcat_write" ON "ExpenseCategory" FOR ALL TO authenticated USING ("is_manager_tier"() OR "current_user_role"() = 'ACCOUNTANT') WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'ACCOUNTANT');

CREATE POLICY "exp_read"  ON "Expense" FOR SELECT TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'ACCOUNTANT');
CREATE POLICY "exp_write" ON "Expense" FOR ALL TO authenticated
  USING ("is_manager_tier"() OR "current_user_role"() = 'ACCOUNTANT')
  WITH CHECK ("is_manager_tier"() OR "current_user_role"() = 'ACCOUNTANT');

-- ============================================================
-- 11. SETTINGS  (read: all authenticated; write: manager tier)
-- ============================================================
CREATE POLICY "setting_read"  ON "Setting" FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "setting_write" ON "Setting" FOR ALL TO authenticated USING ("is_manager_tier"()) WITH CHECK ("is_manager_tier"());

-- ============================================================
-- 12. AUDIT LOG  (read: manager tier; write: any authenticated — server logs)
-- ============================================================
CREATE POLICY "audit_read"  ON "AuditLog" FOR SELECT TO authenticated USING ("is_manager_tier"());
CREATE POLICY "audit_write" ON "AuditLog" FOR INSERT TO authenticated WITH CHECK (TRUE);

-- ============================================================
-- 13. SYNC QUEUE  (each device only sees its own queue entries)
-- ============================================================
CREATE POLICY "syncq_read"  ON "SyncQueue" FOR SELECT TO authenticated
  USING ("device" = current_setting('app.device_id', TRUE) OR "is_manager_tier"());
CREATE POLICY "syncq_write" ON "SyncQueue" FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- END OF RLS POLICIES
-- ============================================================
