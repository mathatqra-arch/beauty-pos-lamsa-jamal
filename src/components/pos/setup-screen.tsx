'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles, Loader2, User, Lock, Store, CheckCircle, Database, AlertCircle, Copy, ExternalLink, Check } from 'lucide-react'
import { toast } from 'sonner'

const SQL_CONTENT = `-- Beauty POS - Database Schema (safe to run multiple times)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL, "passwordHash" TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, role TEXT DEFAULT 'CASHIER', permissions TEXT DEFAULT '[]', active BOOLEAN DEFAULT true, pin TEXT, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Store" (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT, email TEXT, "taxId" TEXT, currency TEXT DEFAULT 'EGP', logo TEXT, "receiptFooter" TEXT, active BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Warehouse" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "storeId" TEXT REFERENCES "Store"(id), location TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Register" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "storeId" TEXT REFERENCES "Store"(id), active BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Category" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "nameAr" TEXT, "parentId" TEXT REFERENCES "Category"(id), color TEXT, icon TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Brand" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "nameAr" TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Unit" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "shortName" TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Supplier" (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, "taxId" TEXT, balance DOUBLE PRECISION DEFAULT 0, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Product" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "nameAr" TEXT, sku TEXT UNIQUE NOT NULL, barcode TEXT UNIQUE, barcodes TEXT DEFAULT '[]', "categoryId" TEXT REFERENCES "Category"(id), "brandId" TEXT REFERENCES "Brand"(id), "unitId" TEXT REFERENCES "Unit"(id), "supplierId" TEXT REFERENCES "Supplier"(id), "storeId" TEXT REFERENCES "Store"(id), "purchaseCost" DOUBLE PRECISION DEFAULT 0, "sellingPrice" DOUBLE PRECISION DEFAULT 0, "wholesalePrice" DOUBLE PRECISION DEFAULT 0, "taxRate" DOUBLE PRECISION DEFAULT 0, "minStock" INTEGER DEFAULT 0, "reorderLevel" INTEGER DEFAULT 0, "trackStock" BOOLEAN DEFAULT true, "allowNegativeStock" BOOLEAN DEFAULT false, "avgCost" DOUBLE PRECISION DEFAULT 0, image TEXT, description TEXT, active BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "StockLevel" (id TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"(id), "warehouseId" TEXT NOT NULL REFERENCES "Warehouse"(id), quantity INTEGER DEFAULT 0, "updatedAt" TIMESTAMP DEFAULT NOW(), UNIQUE("productId", "warehouseId"));
CREATE TABLE IF NOT EXISTS "StockMovement" (id TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"(id), "warehouseId" TEXT NOT NULL REFERENCES "Warehouse"(id), type TEXT NOT NULL, quantity INTEGER NOT NULL, "refType" TEXT, "refId" TEXT, note TEXT, "userId" TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "StockAdjustment" (id TEXT PRIMARY KEY, "productId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL, "oldQuantity" INTEGER NOT NULL, "newQuantity" INTEGER NOT NULL, reason TEXT NOT NULL, note TEXT, "userId" TEXT REFERENCES "User"(id), "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Customer" (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE, email TEXT, address TEXT, notes TEXT, birthday TIMESTAMP, tier TEXT DEFAULT 'BRONZE', active BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "LoyaltyTier" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "displayName" TEXT NOT NULL, "minPoints" INTEGER DEFAULT 0, "earningMultiplier" DOUBLE PRECISION DEFAULT 1.0, "discountPercent" DOUBLE PRECISION DEFAULT 0, color TEXT);
CREATE TABLE IF NOT EXISTS "LoyaltyAccount" (id TEXT PRIMARY KEY, "customerId" TEXT UNIQUE NOT NULL REFERENCES "Customer"(id), points INTEGER DEFAULT 0, "totalEarned" INTEGER DEFAULT 0, "totalRedeemed" INTEGER DEFAULT 0, tier TEXT DEFAULT 'BRONZE', "updatedAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (id TEXT PRIMARY KEY, "customerId" TEXT NOT NULL REFERENCES "Customer"(id), type TEXT NOT NULL, points INTEGER NOT NULL, "refType" TEXT, "refId" TEXT, note TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "LoyaltyCampaign" (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "tierFilter" TEXT, "pointsMultiplier" DOUBLE PRECISION DEFAULT 1.0, "bonusPoints" INTEGER DEFAULT 0, "minPurchase" DOUBLE PRECISION DEFAULT 0, active BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Sale" (id TEXT PRIMARY KEY, "invoiceNumber" TEXT UNIQUE NOT NULL, "customerId" TEXT REFERENCES "Customer"(id), "userId" TEXT NOT NULL REFERENCES "User"(id), "storeId" TEXT REFERENCES "Store"(id), "registerId" TEXT REFERENCES "Register"(id), subtotal DOUBLE PRECISION DEFAULT 0, "discountAmount" DOUBLE PRECISION DEFAULT 0, "discountType" TEXT, "taxAmount" DOUBLE PRECISION DEFAULT 0, total DOUBLE PRECISION DEFAULT 0, "paidAmount" DOUBLE PRECISION DEFAULT 0, "changeAmount" DOUBLE PRECISION DEFAULT 0, status TEXT DEFAULT 'COMPLETED', "paymentMethod" TEXT DEFAULT 'CASH', "paymentDetails" TEXT DEFAULT '{}', "loyaltyEarned" INTEGER DEFAULT 0, "loyaltyRedeemed" INTEGER DEFAULT 0, note TEXT, held BOOLEAN DEFAULT false, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "SaleItem" (id TEXT PRIMARY KEY, "saleId" TEXT NOT NULL REFERENCES "Sale"(id) ON DELETE CASCADE, "productId" TEXT NOT NULL REFERENCES "Product"(id), quantity INTEGER NOT NULL, "unitPrice" DOUBLE PRECISION NOT NULL, "discountAmount" DOUBLE PRECISION DEFAULT 0, "taxAmount" DOUBLE PRECISION DEFAULT 0, total DOUBLE PRECISION NOT NULL, "costAtSale" DOUBLE PRECISION DEFAULT 0);
CREATE TABLE IF NOT EXISTS "SalePayment" (id TEXT PRIMARY KEY, "saleId" TEXT NOT NULL REFERENCES "Sale"(id) ON DELETE CASCADE, method TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "SaleReturn" (id TEXT PRIMARY KEY, "returnNumber" TEXT UNIQUE NOT NULL, "saleId" TEXT NOT NULL REFERENCES "Sale"(id), "userId" TEXT NOT NULL REFERENCES "User"(id), subtotal DOUBLE PRECISION DEFAULT 0, "taxAmount" DOUBLE PRECISION DEFAULT 0, total DOUBLE PRECISION DEFAULT 0, "refundMethod" TEXT DEFAULT 'CASH', reason TEXT, status TEXT DEFAULT 'COMPLETED', "loyaltyReversed" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "SaleReturnItem" (id TEXT PRIMARY KEY, "saleReturnId" TEXT NOT NULL REFERENCES "SaleReturn"(id) ON DELETE CASCADE, "saleItemId" TEXT NOT NULL, "productId" TEXT NOT NULL REFERENCES "Product"(id), quantity INTEGER NOT NULL, "unitPrice" DOUBLE PRECISION NOT NULL, total DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS "CashSession" (id TEXT PRIMARY KEY, "registerId" TEXT NOT NULL REFERENCES "Register"(id), "userId" TEXT NOT NULL REFERENCES "User"(id), "openingBalance" DOUBLE PRECISION DEFAULT 0, "closingBalance" DOUBLE PRECISION, "expectedCash" DOUBLE PRECISION, difference DOUBLE PRECISION, status TEXT DEFAULT 'OPEN', "openedAt" TIMESTAMP DEFAULT NOW(), "closedAt" TIMESTAMP);
CREATE TABLE IF NOT EXISTS "CashMovement" (id TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "CashSession"(id), type TEXT NOT NULL, amount DOUBLE PRECISION NOT NULL, note TEXT, "refType" TEXT, "refId" TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "ExpenseCategory" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "nameAr" TEXT, color TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Expense" (id TEXT PRIMARY KEY, "categoryId" TEXT NOT NULL REFERENCES "ExpenseCategory"(id), "userId" TEXT NOT NULL REFERENCES "User"(id), amount DOUBLE PRECISION NOT NULL, "paymentMethod" TEXT DEFAULT 'CASH', note TEXT, date TIMESTAMP DEFAULT NOW(), "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "Purchase" (id TEXT PRIMARY KEY, "invoiceNumber" TEXT NOT NULL, "supplierId" TEXT NOT NULL REFERENCES "Supplier"(id), "storeId" TEXT REFERENCES "Store"(id), "warehouseId" TEXT, "userId" TEXT REFERENCES "User"(id), subtotal DOUBLE PRECISION DEFAULT 0, "taxAmount" DOUBLE PRECISION DEFAULT 0, "discountAmount" DOUBLE PRECISION DEFAULT 0, total DOUBLE PRECISION DEFAULT 0, "paidAmount" DOUBLE PRECISION DEFAULT 0, status TEXT DEFAULT 'RECEIVED', note TEXT, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "PurchaseItem" (id TEXT PRIMARY KEY, "purchaseId" TEXT NOT NULL REFERENCES "Purchase"(id) ON DELETE CASCADE, "productId" TEXT NOT NULL REFERENCES "Product"(id), quantity INTEGER NOT NULL, "unitCost" DOUBLE PRECISION NOT NULL, "taxRate" DOUBLE PRECISION DEFAULT 0, total DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS "Setting" (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT, category TEXT DEFAULT 'general', "updatedAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "AuditLog" (id TEXT PRIMARY KEY, "userId" TEXT REFERENCES "User"(id), action TEXT NOT NULL, entity TEXT, "entityId" TEXT, before TEXT, after TEXT, "ipAddress" TEXT, device TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS "SyncQueue" (id TEXT PRIMARY KEY, device TEXT, "entityType" TEXT, "entityId" TEXT, operation TEXT, payload TEXT, status TEXT DEFAULT 'PENDING', attempts INTEGER DEFAULT 0, error TEXT, "createdAt" TIMESTAMP DEFAULT NOW(), "syncedAt" TIMESTAMP);

-- Enable RLS on all tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Register" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Unit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockLevel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleReturnItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExpenseCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Purchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncQueue" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe to run multiple times)
DROP POLICY IF EXISTS "Enable all for all" ON "User";
DROP POLICY IF EXISTS "Enable all for all" ON "Store";
DROP POLICY IF EXISTS "Enable all for all" ON "Warehouse";
DROP POLICY IF EXISTS "Enable all for all" ON "Register";
DROP POLICY IF EXISTS "Enable all for all" ON "Category";
DROP POLICY IF EXISTS "Enable all for all" ON "Brand";
DROP POLICY IF EXISTS "Enable all for all" ON "Unit";
DROP POLICY IF EXISTS "Enable all for all" ON "Supplier";
DROP POLICY IF EXISTS "Enable all for all" ON "Product";
DROP POLICY IF EXISTS "Enable all for all" ON "StockLevel";
DROP POLICY IF EXISTS "Enable all for all" ON "StockMovement";
DROP POLICY IF EXISTS "Enable all for all" ON "StockAdjustment";
DROP POLICY IF EXISTS "Enable all for all" ON "Customer";
DROP POLICY IF EXISTS "Enable all for all" ON "LoyaltyTier";
DROP POLICY IF EXISTS "Enable all for all" ON "LoyaltyAccount";
DROP POLICY IF EXISTS "Enable all for all" ON "LoyaltyTransaction";
DROP POLICY IF EXISTS "Enable all for all" ON "LoyaltyCampaign";
DROP POLICY IF EXISTS "Enable all for all" ON "Sale";
DROP POLICY IF EXISTS "Enable all for all" ON "SaleItem";
DROP POLICY IF EXISTS "Enable all for all" ON "SalePayment";
DROP POLICY IF EXISTS "Enable all for all" ON "SaleReturn";
DROP POLICY IF EXISTS "Enable all for all" ON "SaleReturnItem";
DROP POLICY IF EXISTS "Enable all for all" ON "CashSession";
DROP POLICY IF EXISTS "Enable all for all" ON "CashMovement";
DROP POLICY IF EXISTS "Enable all for all" ON "ExpenseCategory";
DROP POLICY IF EXISTS "Enable all for all" ON "Expense";
DROP POLICY IF EXISTS "Enable all for all" ON "Purchase";
DROP POLICY IF EXISTS "Enable all for all" ON "PurchaseItem";
DROP POLICY IF EXISTS "Enable all for all" ON "Setting";
DROP POLICY IF EXISTS "Enable all for all" ON "AuditLog";
DROP POLICY IF EXISTS "Enable all for all" ON "SyncQueue";

-- Create permissive policies for authenticated only (server uses service_role key)
CREATE POLICY "Enable all for all" ON "User" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Store" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Warehouse" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Register" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Category" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Brand" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Unit" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Supplier" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Product" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "StockLevel" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "StockMovement" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "StockAdjustment" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Customer" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "LoyaltyTier" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "LoyaltyAccount" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "LoyaltyTransaction" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "LoyaltyCampaign" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Sale" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "SaleItem" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "SalePayment" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "SaleReturn" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "SaleReturnItem" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "CashSession" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "CashMovement" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "ExpenseCategory" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Expense" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Purchase" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "PurchaseItem" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "Setting" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "AuditLog" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for all" ON "SyncQueue" FOR ALL TO authenticated USING (true) WITH CHECK (true);`


export function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'checking' | 'tables-missing' | 'db-ready' | 'done'>('checking')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminUsername, setAdminUsername] = useState('admin')
  const [adminPassword, setAdminPassword] = useState('')
  const [storeName, setStoreName] = useState('لمسة جمال - مستحضرات تجميل')

  const checkDbStatus = async () => {
    setPhase('checking')
    try {
      const data = await apiFetch('/setup-db')
      if (data.tablesExist === false) {
        setPhase('tables-missing')
      } else if (data.needsSetup) {
        setPhase('db-ready')
      } else {
        onComplete()
      }
    } catch (e: any) {
      setPhase('tables-missing')
    }
  }

  useEffect(() => {
    checkDbStatus()
  }, [])

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(SQL_CONTENT)
      setCopied(true)
      toast.success('تم نسخ SQL! الصقه في Supabase SQL Editor')
      setTimeout(() => setCopied(false), 3000)
    } catch (e) {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = SQL_CONTENT
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      toast.success('تم نسخ SQL!')
      setTimeout(() => setCopied(false), 3000)
    }
  }

  const handleSetup = async () => {
    setLoading(true)
    try {
      await apiFetch('/setup', {
        method: 'POST',
        body: JSON.stringify({ adminName, adminUsername, adminPassword, storeName }),
      })
      toast.success('تم إعداد النظام بنجاح!')
      setPhase('done')
      setTimeout(() => onComplete(), 2000)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/20 p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 animate-pulse">
            <Sparkles className="w-8 h-8" />
          </div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (phase === 'tables-missing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/20 p-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
              <Sparkles className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold">إعداد قاعدة البيانات</h1>
            <p className="text-muted-foreground mt-2">خطوة واحدة فقط - انسخ والصق</p>
          </div>

          <Card className="shadow-xl mb-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                خطوات الإعداد
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">1</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">افتح Supabase SQL Editor</p>
                    <a href="https://supabase.com/dashboard/project/llwcldhmutluxpscrfuy/sql/new" target="_blank" rel="noopener" className="text-primary text-sm underline flex items-center gap-1 mt-1">
                      انقر هنا لفتح SQL Editor <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">2</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">انسخ كود SQL من الأسفل</p>
                    <p className="text-xs text-muted-foreground mt-1">اضغط زر "نسخ SQL" بالأسفل</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">3</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">الصقه في SQL Editor واضغط Run</p>
                    <p className="text-xs text-muted-foreground mt-1">زر أخضر "Run" في الأسفل</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">4</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">ارجع هنا واضغط "تحقق"</p>
                  </div>
                </div>
              </div>

              <Button
                className="w-full h-12 text-base"
                onClick={copySql}
                variant={copied ? "default" : "outline"}
              >
                {copied ? (
                  <><Check className="w-5 h-5 ml-2" />تم النسخ! الصقه في Supabase</>
                ) : (
                  <><Copy className="w-5 h-5 ml-2" />نسخ SQL</>
                )}
              </Button>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">supabase-schema.sql</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={copySql}>
                    <Copy className="w-3 h-3 ml-1" />نسخ
                  </Button>
                </div>
                <pre className="p-3 text-xs overflow-auto max-h-48 bg-background font-mono" dir="ltr">
                  <code>{SQL_CONTENT.substring(0, 500)}...</code>
                </pre>
              </div>

              <Button className="w-full h-12" onClick={checkDbStatus}>
                <Database className="w-5 h-5 ml-2" />
                تحقق - لقد نفذت SQL
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (phase === 'db-ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/20 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
              <Sparkles className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold">إعداد النظام</h1>
            <p className="text-muted-foreground mt-2">قاعدة البيانات جاهزة - أنشئ حساب المدير</p>
          </div>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-center flex items-center justify-center gap-2">
                <span className={step >= 1 ? 'text-primary' : 'text-muted-foreground'}>①</span>
                <span className={step >= 2 ? 'text-primary' : 'text-muted-foreground'}>②</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <Store className="w-10 h-10 mx-auto text-primary mb-2" />
                    <h3 className="font-bold">معلومات المتجر</h3>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store">اسم المتجر</Label>
                    <Input id="store" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={() => setStep(2)} disabled={!storeName}>التالي</Button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <User className="w-10 h-10 mx-auto text-primary mb-2" />
                    <h3 className="font-bold">حساب المدير</h3>
                  </div>
                  <div className="space-y-2">
                    <Label>الاسم الكامل</Label>
                    <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="سارة أحمد" />
                  </div>
                  <div className="space-y-2">
                    <Label>اسم المستخدم</Label>
                    <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>كلمة المرور</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input type="password" className="pr-9" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="6 أحرف" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>رجوع</Button>
                    <Button className="flex-1" onClick={handleSetup} disabled={loading || !adminName || adminPassword.length < 6}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إعداد'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/20 p-4">
      <div className="text-center space-y-4">
        <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
        <h3 className="text-xl font-bold">تم الإعداد بنجاح!</h3>
        <p className="text-muted-foreground">جاري التحويل...</p>
      </div>
    </div>
  )
}
