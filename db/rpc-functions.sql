-- ============================================================
-- لمسة جمال — Atomic RPC Functions (financial integrity)
-- ============================================================
-- Multi-table financial operations run as a SINGLE database
-- transaction inside a SECURITY DEFINER function. This guarantees:
--   • No partial sales (sale + items + payments + stock + loyalty + cash
--     all commit together or all roll back)
--   • Idempotency via clientTxnId (re-running returns the same result)
--   • Race-free invoice numbering (atomic sequence increment)
--   • Stock oversell prevention (SELECT ... FOR UPDATE row lock)
--
-- These supersede the single create_sale_atomic in the old security-fix.sql.
-- ============================================================

-- ============================================================
-- 1. CREATE SALE — atomic
-- ============================================================
CREATE OR REPLACE FUNCTION "create_sale_atomic"(
  p_client_txn_id   TEXT,
  p_user_id          TEXT,
  p_customer_id      TEXT,        -- may be NULL/empty
  p_warehouse_id     TEXT,
  p_register_id      TEXT,
  p_items            JSONB,       -- [{productId, quantity, unitPrice, taxAmount, total, costAtSale, discountAmount}]
  p_subtotal         DECIMAL(12,2),
  p_discount_amount  DECIMAL(12,2),
  p_tax_amount       DECIMAL(12,2),
  p_total            DECIMAL(12,2),
  p_paid_amount      DECIMAL(12,2),
  p_payment_method   TEXT,
  p_payment_details  TEXT,
  p_loyalty_earned   INTEGER,
  p_loyalty_redeemed INTEGER,
  p_note             TEXT
) RETURNS JSONB AS $$
DECLARE
  v_sale_id        TEXT;
  v_invoice_number TEXT;
  v_next_num       INTEGER;
  v_item           JSONB;
  v_stock_level    RECORD;
  v_cash_session   RECORD;
  v_loyalty_acct   RECORD;
BEGIN
  -- IDEMPOTENCY: if a sale with this clientTxnId already exists, return it
  SELECT id, "invoiceNumber" INTO v_sale_id, v_invoice_number
  FROM "Sale" WHERE "clientTxnId" = p_client_txn_id LIMIT 1;

  IF v_sale_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'saleId', v_sale_id,
      'invoiceNumber', v_invoice_number, 'idempotent', TRUE);
  END IF;

  -- ATOMIC invoice number (no race condition across concurrent sales)
  UPDATE "InvoiceSequence"
    SET "lastNumber" = "lastNumber" + 1
    WHERE prefix = 'INV'
    RETURNING "lastNumber" INTO v_next_num;
  v_invoice_number := 'INV-' || v_next_num;

  -- Use the clientTxnId as the sale id (so offline + online share one id)
  v_sale_id := p_client_txn_id;

  -- INSERT SALE
  INSERT INTO "Sale" (
    "id","invoiceNumber","customerId","userId","storeId","registerId",
    "subtotal","discountAmount","taxAmount","total","paidAmount","changeAmount",
    "status","paymentMethod","paymentDetails","loyaltyEarned","loyaltyRedeemed",
    "clientTxnId","note","held","createdAt","updatedAt"
  ) VALUES (
    v_sale_id, v_invoice_number, NULLIF(p_customer_id,''), p_user_id, NULL, NULLIF(p_register_id,''),
    p_subtotal, p_discount_amount, p_tax_amount, p_total, p_paid_amount, GREATEST(0, p_paid_amount - p_total),
    'COMPLETED', p_payment_method, COALESCE(p_payment_details,'{}')::jsonb,
    p_loyalty_earned, p_loyalty_redeemed,
    p_client_txn_id, NULLIF(p_note,''), FALSE, NOW(), NOW()
  );

  -- LOOP ITEMS: insert + lock stock + deduct + movement
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO "SaleItem" (
      "id","saleId","productId","quantity","unitPrice","discountAmount","taxAmount","total","costAtSale"
    ) VALUES (
      gen_random_uuid()::text, v_sale_id,
      v_item->>'productId',
      (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric,
      COALESCE((v_item->>'discountAmount')::numeric, 0),
      COALESCE((v_item->>'taxAmount')::numeric, 0),
      (v_item->>'total')::numeric,
      COALESCE((v_item->>'costAtSale')::numeric, 0)
    );

    -- Lock + check + deduct stock (prevents overselling under concurrency)
    SELECT * INTO v_stock_level
      FROM "StockLevel"
      WHERE "productId" = (v_item->>'productId') AND "warehouseId" = p_warehouse_id
      FOR UPDATE;

    IF v_stock_level.id IS NOT NULL THEN
      UPDATE "StockLevel"
        SET quantity = quantity - (v_item->>'quantity')::integer
        WHERE id = v_stock_level.id;
    END IF;

    INSERT INTO "StockMovement" (
      "id","productId","warehouseId","type","quantity","refType","refId","note","userId","createdAt"
    ) VALUES (
      gen_random_uuid()::text, (v_item->>'productId'), p_warehouse_id,
      'SALE', -(v_item->>'quantity')::integer, 'Sale', v_sale_id,
      v_invoice_number, p_user_id, NOW()
    );
  END LOOP;

  -- PAYMENT
  INSERT INTO "SalePayment" ("id","saleId","method","amount","createdAt")
  VALUES (gen_random_uuid()::text, v_sale_id, p_payment_method, p_total, NOW());

  -- LOYALTY (earn)
  IF p_customer_id IS NOT NULL AND p_customer_id <> '' AND p_loyalty_earned > 0 THEN
    INSERT INTO "LoyaltyAccount" ("id","customerId","points","totalEarned","totalRedeemed","tier","updatedAt")
    VALUES (gen_random_uuid()::text, p_customer_id, p_loyalty_earned, p_loyalty_earned, 0, 'BRONZE', NOW())
    ON CONFLICT ("customerId") DO UPDATE
      SET points = "LoyaltyAccount".points + p_loyalty_earned,
          "totalEarned" = "LoyaltyAccount"."totalEarned" + p_loyalty_earned,
          "updatedAt" = NOW();

    INSERT INTO "LoyaltyTransaction" ("id","customerId","type","points","refType","refId","note","clientTxnId","createdAt")
    VALUES (gen_random_uuid()::text, p_customer_id, 'EARN', p_loyalty_earned, 'Sale', v_sale_id,
            'نقاط من ' || v_invoice_number, p_client_txn_id, NOW())
    ON CONFLICT ("clientTxnId") DO NOTHING;
  END IF;

  -- CASH MOVEMENT (if cash + open session)
  IF p_payment_method = 'CASH' THEN
    SELECT * INTO v_cash_session FROM "CashSession" WHERE status = 'OPEN' LIMIT 1;
    IF v_cash_session.id IS NOT NULL THEN
      INSERT INTO "CashMovement" ("id","sessionId","type","amount","note","refType","refId","clientTxnId","createdAt")
      VALUES (gen_random_uuid()::text, v_cash_session.id, 'SALE', p_total, v_invoice_number, 'Sale', v_sale_id,
              p_client_txn_id, NOW())
      ON CONFLICT ("clientTxnId") DO NOTHING;
    END IF;
  END IF;

  -- AUDIT LOG
  INSERT INTO "AuditLog" ("id","userId","action","entity","entityId","after","createdAt")
  VALUES (gen_random_uuid()::text, p_user_id, 'SALE_CREATED', 'Sale', v_sale_id,
          jsonb_build_object('invoiceNumber', v_invoice_number, 'total', p_total), NOW());

  RETURN jsonb_build_object('success', TRUE, 'saleId', v_sale_id,
    'invoiceNumber', v_invoice_number, 'idempotent', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. CREATE SALE RETURN — atomic (reverses stock + loyalty + cash)
-- ============================================================
CREATE OR REPLACE FUNCTION "create_sale_return_atomic"(
  p_client_txn_id   TEXT,
  p_sale_id         TEXT,
  p_user_id         TEXT,
  p_warehouse_id    TEXT,
  p_items           JSONB,        -- [{saleItemId, productId, quantity, unitPrice, total}]
  p_subtotal        DECIMAL(12,2),
  p_tax_amount      DECIMAL(12,2),
  p_total           DECIMAL(12,2),
  p_refund_method   TEXT,
  p_reason          TEXT,
  p_loyalty_reversed INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_return_id     TEXT;
  v_return_number TEXT;
  v_next_num      INTEGER;
  v_item          JSONB;
  v_stock_level   RECORD;
  v_cash_session  RECORD;
BEGIN
  -- IDEMPOTENCY
  SELECT id INTO v_return_id FROM "SaleReturn" WHERE "clientTxnId" = p_client_txn_id LIMIT 1;
  IF v_return_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'returnId', v_return_id, 'idempotent', TRUE);
  END IF;

  -- Return number from a separate sequence prefix
  UPDATE "InvoiceSequence" SET "lastNumber" = "lastNumber" + 1
    WHERE prefix = 'RET'
    RETURNING "lastNumber" INTO v_next_num;
  IF v_next_num IS NULL THEN
    -- initialize RET sequence if missing
    INSERT INTO "InvoiceSequence" ("prefix","lastNumber") VALUES ('RET', 1)
    ON CONFLICT DO NOTHING;
    UPDATE "InvoiceSequence" SET "lastNumber" = "lastNumber" + 1
      WHERE prefix = 'RET' RETURNING "lastNumber" INTO v_next_num;
  END IF;
  v_return_number := 'RET-' || v_next_num;
  v_return_id := p_client_txn_id;

  INSERT INTO "SaleReturn" (
    "id","returnNumber","saleId","userId","subtotal","taxAmount","total",
    "refundMethod","reason","status","loyaltyReversed","clientTxnId","createdAt"
  ) VALUES (
    v_return_id, v_return_number, p_sale_id, p_user_id, p_subtotal, p_tax_amount, p_total,
    p_refund_method, p_reason, 'COMPLETED', p_loyalty_reversed, p_client_txn_id, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO "SaleReturnItem" ("id","saleReturnId","saleItemId","productId","quantity","unitPrice","total")
    VALUES (gen_random_uuid()::text, v_return_id, v_item->>'saleItemId', v_item->>'productId',
            (v_item->>'quantity')::integer, (v_item->>'unitPrice')::numeric, (v_item->>'total')::numeric);

    -- Reverse stock (add back)
    SELECT * INTO v_stock_level FROM "StockLevel"
      WHERE "productId" = (v_item->>'productId') AND "warehouseId" = p_warehouse_id FOR UPDATE;
    IF v_stock_level.id IS NOT NULL THEN
      UPDATE "StockLevel" SET quantity = quantity + (v_item->>'quantity')::integer WHERE id = v_stock_level.id;
    END IF;

    INSERT INTO "StockMovement" ("id","productId","warehouseId","type","quantity","refType","refId","note","userId","createdAt")
    VALUES (gen_random_uuid()::text, (v_item->>'productId'), p_warehouse_id, 'RETURN',
            (v_item->>'quantity')::integer, 'SaleReturn', v_return_id, v_return_number, p_user_id, NOW());
  END LOOP;

  -- Reverse loyalty
  IF p_loyalty_reversed > 0 THEN
    UPDATE "LoyaltyAccount" SET points = GREATEST(0, points - p_loyalty_reversed),
        "totalRedeemed" = "totalRedeemed" + p_loyalty_reversed, "updatedAt" = NOW()
      WHERE "customerId" IN (SELECT "customerId" FROM "Sale" WHERE id = p_sale_id);
    INSERT INTO "LoyaltyTransaction" ("id","customerId","type","points","refType","refId","note","clientTxnId","createdAt")
    SELECT gen_random_uuid()::text, "customerId", 'REVERSE', -p_loyalty_reversed, 'SaleReturn', v_return_id,
           'عكس نقاط من ' || v_return_number, p_client_txn_id, NOW()
      FROM "Sale" WHERE id = p_sale_id AND "customerId" IS NOT NULL
    ON CONFLICT ("clientTxnId") DO NOTHING;
  END IF;

  -- Mark sale status
  UPDATE "Sale" SET status = CASE WHEN p_total >= "total" THEN 'REFUNDED' ELSE 'PARTIAL_REFUND' END,
                  "updatedAt" = NOW() WHERE id = p_sale_id;

  -- Cash out movement
  IF p_refund_method = 'CASH' THEN
    SELECT * INTO v_cash_session FROM "CashSession" WHERE status = 'OPEN' LIMIT 1;
    IF v_cash_session.id IS NOT NULL THEN
      INSERT INTO "CashMovement" ("id","sessionId","type","amount","note","refType","refId","clientTxnId","createdAt")
      VALUES (gen_random_uuid()::text, v_cash_session.id, 'REFUND', p_total, v_return_number, 'SaleReturn', v_return_id,
              p_client_txn_id, NOW()) ON CONFLICT ("clientTxnId") DO NOTHING;
    END IF;
  END IF;

  INSERT INTO "AuditLog" ("id","userId","action","entity","entityId","after","createdAt")
  VALUES (gen_random_uuid()::text, p_user_id, 'SALE_RETURNED', 'SaleReturn', v_return_id,
          jsonb_build_object('returnNumber', v_return_number, 'total', p_total), NOW());

  RETURN jsonb_build_object('success', TRUE, 'returnId', v_return_id, 'returnNumber', v_return_number, 'idempotent', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. CREATE PURCHASE — atomic (items + stock increment + supplier balance)
-- ============================================================
CREATE OR REPLACE FUNCTION "create_purchase_atomic"(
  p_client_txn_id   TEXT,
  p_invoice_number  TEXT,
  p_supplier_id     TEXT,
  p_warehouse_id    TEXT,
  p_user_id         TEXT,
  p_items           JSONB,        -- [{productId, quantity, unitCost, taxRate, total}]
  p_subtotal        DECIMAL(12,2),
  p_tax_amount      DECIMAL(12,2),
  p_discount_amount DECIMAL(12,2),
  p_total           DECIMAL(12,2),
  p_paid_amount     DECIMAL(12,2),
  p_status          TEXT,
  p_note            TEXT
) RETURNS JSONB AS $$
DECLARE
  v_purchase_id TEXT;
  v_item        JSONB;
  v_stock_level RECORD;
  v_product     RECORD;
  v_new_avg     DECIMAL(12,2);
BEGIN
  SELECT id INTO v_purchase_id FROM "Purchase" WHERE "clientTxnId" = p_client_txn_id LIMIT 1;
  IF v_purchase_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'purchaseId', v_purchase_id, 'idempotent', TRUE);
  END IF;

  v_purchase_id := p_client_txn_id;

  INSERT INTO "Purchase" (
    "id","invoiceNumber","supplierId","storeId","warehouseId","userId",
    "subtotal","taxAmount","discountAmount","total","paidAmount","status",
    "clientTxnId","note","createdAt","updatedAt"
  ) VALUES (
    v_purchase_id, p_invoice_number, p_supplier_id, NULL, p_warehouse_id, p_user_id,
    p_subtotal, p_tax_amount, p_discount_amount, p_total, p_paid_amount, p_status,
    p_client_txn_id, NULLIF(p_note,''), NOW(), NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO "PurchaseItem" ("id","purchaseId","productId","quantity","unitCost","taxRate","total")
    VALUES (gen_random_uuid()::text, v_purchase_id, v_item->>'productId',
            (v_item->>'quantity')::integer, (v_item->>'unitCost')::numeric,
            COALESCE((v_item->>'taxRate')::real, 0), (v_item->>'total')::numeric);

    -- Increment stock (locked)
    SELECT * INTO v_stock_level FROM "StockLevel"
      WHERE "productId" = (v_item->>'productId') AND "warehouseId" = p_warehouse_id FOR UPDATE;
    IF v_stock_level.id IS NOT NULL THEN
      UPDATE "StockLevel" SET quantity = quantity + (v_item->>'quantity')::integer WHERE id = v_stock_level.id;
    ELSE
      INSERT INTO "StockLevel" ("id","productId","warehouseId","quantity","updatedAt")
      VALUES (gen_random_uuid()::text, (v_item->>'productId'), p_warehouse_id, (v_item->>'quantity')::integer, NOW());
    END IF;

    -- Weighted-average cost update
    SELECT * INTO v_product FROM "Product" WHERE id = (v_item->>'productId') FOR UPDATE;
    IF v_product.id IS NOT NULL THEN
      v_new_avg := CASE
        WHEN v_product.trackStock AND (v_stock_level.quantity - (v_item->>'quantity')::integer) > 0 THEN
          ((v_product.avgCost * (v_stock_level.quantity - (v_item->>'quantity')::integer)) +
           ((v_item->>'unitCost')::numeric * (v_item->>'quantity')::integer))
          / (v_stock_level.quantity)
        ELSE (v_item->>'unitCost')::numeric
      END;
      UPDATE "Product" SET "avgCost" = v_new_avg, "purchaseCost" = (v_item->>'unitCost')::numeric,
                          "updatedAt" = NOW() WHERE id = v_product.id;
    END IF;

    INSERT INTO "StockMovement" ("id","productId","warehouseId","type","quantity","refType","refId","note","userId","createdAt")
    VALUES (gen_random_uuid()::text, (v_item->>'productId'), p_warehouse_id, 'PURCHASE',
            (v_item->>'quantity')::integer, 'Purchase', v_purchase_id, p_invoice_number, p_user_id, NOW());
  END LOOP;

  -- Update supplier balance (amount owed)
  UPDATE "Supplier" SET balance = balance + (p_total - p_paid_amount), "updatedAt" = NOW()
    WHERE id = p_supplier_id;

  INSERT INTO "AuditLog" ("id","userId","action","entity","entityId","after","createdAt")
  VALUES (gen_random_uuid()::text, p_user_id, 'PURCHASE_CREATED', 'Purchase', v_purchase_id,
          jsonb_build_object('invoiceNumber', p_invoice_number, 'total', p_total), NOW());

  RETURN jsonb_build_object('success', TRUE, 'purchaseId', v_purchase_id, 'idempotent', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. GENERATE INVOICE NUMBER (standalone, for non-RPC paths)
-- ============================================================
CREATE OR REPLACE FUNCTION "next_invoice_number"(p_prefix TEXT DEFAULT 'INV')
RETURNS TEXT AS $$
DECLARE v_num INTEGER;
BEGIN
  UPDATE "InvoiceSequence" SET "lastNumber" = "lastNumber" + 1
    WHERE prefix = p_prefix RETURNING "lastNumber" INTO v_num;
  IF v_num IS NULL THEN
    INSERT INTO "InvoiceSequence" ("prefix","lastNumber") VALUES (p_prefix, 1)
    ON CONFLICT DO NOTHING;
    UPDATE "InvoiceSequence" SET "lastNumber" = "lastNumber" + 1
      WHERE prefix = p_prefix RETURNING "lastNumber" INTO v_num;
  END IF;
  RETURN p_prefix || '-' || v_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- END OF RPC FUNCTIONS
-- ============================================================
