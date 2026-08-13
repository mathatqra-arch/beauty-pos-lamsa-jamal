import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/seed-demo — populate demo products + customers + suppliers
// ============================================================
// Adds realistic beauty-store demo data so the deployed app can be
// tested end-to-end (POS, inventory, CRM, loyalty, reports).
//
// Idempotent: if products already exist, returns current counts
// without duplicating.
//
// Run AFTER /api/setup (which creates store, admin, categories).
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const limited = applyRateLimit(req, 'setup', RATE_LIMITS.SETUP)
    if (limited) return limited

    // Parse body for optional force flag
    const body = await req.json().catch(() => ({}))
    const force = body?.force === true

    // ─── IDEMPOTENCY: skip only if there's a substantial catalog (≥10 products)
    // AND force=false. A few test products shouldn't block seeding the full demo.
    const existingProducts = await db.product.count()
    if (existingProducts >= 10 && !force) {
      const [customers, suppliers, categories] = await Promise.all([
        db.customer.count(),
        db.supplier.count(),
        db.category.count(),
      ])
      return successResponse({
        message: 'البيانات التجريبية موجودة بالفعل',
        counts: { products: existingProducts, customers, suppliers, categories },
        skipped: true,
      })
    }

    // ─── FETCH STORE + WAREHOUSE + CATEGORIES (created by /api/setup) ───
    const stores = await db.store.findMany({ take: 1 })
    const store = stores[0]
    if (!store) return errorResponse('يجب تشغيل /api/setup أولاً لإنشاء المتجر', 400)

    const warehouses = await db.warehouse.findMany({ take: 1 })
    const warehouse = warehouses[0]

    const categories = await db.category.findMany()
    const catMap: Record<string, string> = {}
    for (const c of categories) {
      if (c.nameAr) catMap[c.nameAr] = c.id
    }

    // ─── 1. CREATE SUPPLIERS (8) ───
    const supplierData = [
      ['شركة الجمال للتوزيع', '01000000001', 'supplies@beauty-dist.com'],
      ['مؤسسة العطور المصرية', '01000000002', 'info@egypt-perfumes.com'],
      ['وكالة مكياج باريس', '01000000003', 'contact@paris-makeup.com'],
      ['شركة نيفيا للشرق الأوسط', '01000000004', 'me@nivea.com'],
      ['مستوردات روز للتجميل', '01000000005', 'sales@rose-beauty.com'],
      ['شركة دياموند للعطور', '01000000006', 'orders@diamond-perfumes.com'],
      ['موزع لوريال مصر', '01000000007', 'egypt@loreal.com'],
      ['بيوتي سابلاي إيجيبت', '01000000008', 'hello@beautysupply-eg.com'],
    ] as const

    const supplierIds: string[] = []
    for (const [name, phone, email] of supplierData) {
      const s = await db.supplier.create({
        data: { name, phone, email, balance: 0, active: true },
      })
      supplierIds.push(s.id)
    }

    // ─── 2. CREATE PRODUCTS (40 — realistic beauty catalog) ───
    // [name, nameAr, categoryAr, cost, price, stock, barcode]
    type PRow = [string, string, string, number, number, number, string]
    const products: PRow[] = [
      ['Dior J\'adore EDP 100ml', 'ديور جادور 100مل', 'العطور', 1800, 3200, 15, '3348900123451'],
      ['Chanel Coco Mademoiselle 100ml', 'شانيل كوكو مدموازيل 100مل', 'العطور', 2200, 3900, 10, '3348900123452'],
      ['Dior Sauvage EDT 100ml', 'ديور سوفاج 100مل', 'العطور', 1700, 3000, 20, '3348900123454'],
      ['Chanel Bleu de Chanel 100ml', 'شانيل بلو 100مل', 'العطور', 2000, 3600, 12, '3348900123455'],
      ['Oud Royal 50ml', 'عطر العود الملكي 50مل', 'العطور', 900, 1800, 25, '3348900123456'],
      ['MAC Ruby Woo Lipstick', 'ماك أحمر شفاه روبي وو', 'المكياج', 350, 650, 40, '3348900123458'],
      ['Maybelline SuperStay Matte', 'ميبيلين سوبرستاي مات', 'المكياج', 120, 250, 60, '3348900123459'],
      ['L\'Oréal Color Riche', 'لوريال كولور ريش', 'المكياج', 130, 270, 35, '3348900123460'],
      ['MAC Fluidline Eye Liner', 'ماك آي لاينر', 'المكياج', 280, 520, 30, '3348900123461'],
      ['Maybelline Lash Sensational', 'ميبيلين ماسكرا لاش', 'المكياج', 110, 230, 70, '3348900123462'],
      ['Dior 5 Couleurs Palette', 'ديور باليت ظلال 5 ألوان', 'المكياج', 900, 1700, 18, '3348900123464'],
      ['L\'Oréal True Match Foundation', 'لوريال ترو ماتش فاونديشن', 'المكياج', 240, 480, 45, '3348900123465'],
      ['MAC Studio Fix Fluid', 'ماك ستوديو فيكس', 'المكياج', 420, 780, 28, '3348900123466'],
      ['Maybelline Fit Me Foundation', 'ميبيلين فيت مي', 'المكياج', 140, 290, 50, '3348900123467'],
      ['Nivea Gentle Cleansing Gel', 'نيفيا غسول لطيف', 'العناية بالبشرة', 90, 190, 80, '3348900123470'],
      ['L\'Oréal Micellar Water', 'لوريال ماء ميسيلار', 'العناية بالبشرة', 110, 230, 65, '3348900123471'],
      ['Nivea Soft Moisturizer 200ml', 'نيفيا سوفت مرطب 200مل', 'العناية بالبشرة', 130, 270, 70, '3348900123472'],
      ['L\'Oréal Revitalift Serum', 'لوريال ريفيتاليفت سيروم', 'العناية بالبشرة', 280, 540, 30, '3348900123474'],
      ['L\'Oréal UV Defender SPF50', 'لوريال واقي شمس SPF50', 'العناية بالبشرة', 200, 400, 48, '3348900123476'],
      ['Nivea Sun Protect SPF50', 'نيفيا واقي شمس SPF50', 'العناية بالبشرة', 150, 310, 52, '3348900123477'],
      ['L\'Oréal Elseve Shampoo 400ml', 'لوريال السف شامبو 400مل', 'العناية بالشعر', 95, 200, 90, '3348900123478'],
      ['Nivea Hair Care Shampoo', 'نيفيا شامبو للشعر', 'العناية بالشعر', 85, 180, 75, '3348900123479'],
      ['L\'Oréal Elseve Conditioner', 'لوريال السف بلسم', 'العناية بالشعر', 95, 200, 70, '3348900123480'],
      ['L\'Oréal Extraordinary Oil', 'لوريال زيت استثنائي', 'العناية بالشعر', 180, 360, 40, '3348900123482'],
      ['Nivea Body Lotion 400ml', 'نيفيا لوشن للجسم 400مل', 'العناية بالجسم', 130, 270, 80, '3348900123487'],
      ['L\'Oréal Body Care Lotion', 'لوريال لوشن للجسم', 'العناية بالجسم', 150, 310, 65, '3348900123488'],
      ['Nivea Creme Soft Soap', 'نيفيا صابون كريم سوفت', 'العناية بالجسم', 55, 120, 120, '3348900123489'],
      ['Nivea Rose Body Wash', 'نيفيا غسول ورد للجسم', 'العناية بالجسم', 90, 190, 95, '3348900123490'],
      ['MAC 217 Blending Brush', 'ماك فرشاة 217 دمج', 'أدوات التجميل', 320, 600, 35, '3348900123491'],
      ['MAC 187 Duo Fibre Brush', 'ماك فرشاة 187', 'أدوات التجميل', 380, 720, 28, '3348900123492'],
      ['Vanity Mirror LED', 'مرآة فانيتي LED', 'أدوات التجميل', 450, 900, 15, '3348900123493'],
      ['Makeup Sponge Set 3pc', 'طقم إسفنج مكياج 3 قطع', 'أدوات التجميل', 80, 180, 90, '3348900123494'],
      ['Dior Addict Lipstick', 'ديور أديكت أحمر شفاه', 'المكياج', 480, 880, 25, '3348900123495'],
      ['Chanel Rouge Coco', 'شانيل روج كوكو', 'المكياج', 520, 950, 18, '3348900123496'],
      ['MAC Prep + Prime', 'ماك بريب أند برايم', 'المكياج', 290, 540, 32, '3348900123497'],
      ['Nivea Q10 Anti-Age', 'نيفيا Q10 مضاد تجاعيم', 'العناية بالبشرة', 180, 360, 45, '3348900123498'],
      ['Dior Lip Glow', 'ديور ليب جلو', 'المكياج', 350, 650, 30, '3348900123500'],
      ['Chanel Le Volume Mascara', 'شانيل لوفوليم ماسكرا', 'المكياج', 380, 700, 28, '3348900123501'],
      ['MAC Pro Longwear Concealer', 'ماك كونسيلر برو لونج', 'المكياج', 300, 560, 35, '3348900123502'],
      ['Nivea Soft Rose Lip Balm', 'نيفيا بلسم شفاه وردي', 'العناية بالبشرة', 45, 95, 130, '3348900123503'],
    ]

    let productCount = 0
    for (let i = 0; i < products.length; i++) {
      const [name, nameAr, catAr, cost, price, stock, barcode] = products[i]
      const categoryId = catMap[catAr] || null
      const supplierId = supplierIds[i % supplierIds.length]
      const sku = `PRD-${String(i + 1).padStart(4, '0')}`

      await db.product.create({
        data: {
          name,
          nameAr,
          sku,
          barcode,
          barcodes: '[]',
          categoryId,
          supplierId,
          storeId: store.id,
          purchaseCost: cost,
          sellingPrice: price,
          wholesalePrice: Math.round(cost * 1.15 * 100) / 100,
          taxRate: 14,
          minStock: 5,
          reorderLevel: 10,
          trackStock: true,
          allowNegativeStock: false,
          avgCost: cost,
          active: true,
          currentStock: stock,
          syncStatus: 'synced',
          stockLevels: warehouse ? {
            create: [{ warehouseId: warehouse.id, quantity: stock }]
          } : undefined,
        },
      })
      productCount++
    }

    // ─── 3. CREATE CUSTOMERS (15 — all tiers) ───
    const customerData: Array<[string, string, string, string]> = [
      ['سارة أحمد', '01010000001', 'sara@example.com', 'GOLD'],
      ['منى محمود', '01010000002', 'mona@example.com', 'SILVER'],
      ['فاطمة علي', '01010000003', 'fatma@example.com', 'BRONZE'],
      ['نورا حسن', '01010000004', 'noura@example.com', 'VIP'],
      ['هالة خالد', '01010000005', 'hala@example.com', 'GOLD'],
      ['ريم سعيد', '01010000006', 'reem@example.com', 'SILVER'],
      ['دعاء فؤاد', '01010000007', 'doaa@example.com', 'BRONZE'],
      ['مريم أيمن', '01010000008', 'maryam@example.com', 'BRONZE'],
      ['آية طارق', '01010000009', 'aya@example.com', 'SILVER'],
      ['ياسمين وليد', '01010000010', 'yasmin@example.com', 'GOLD'],
      ['إيمان رجب', '01010000011', 'eman@example.com', 'BRONZE'],
      ['سما أحمد', '01010000012', 'sama@example.com', 'BRONZE'],
      ['ليلى ناصر', '01010000013', 'laila@example.com', 'VIP'],
      ['روان كمال', '01010000014', 'rawan@example.com', 'SILVER'],
      ['ندى أيوب', '01010000015', 'nada@example.com', 'BRONZE'],
    ]

    let customerCount = 0
    for (const [name, phone, email, tier] of customerData) {
      const points = tier === 'VIP' ? 5000 : tier === 'GOLD' ? 2000 : tier === 'SILVER' ? 800 : 100
      await db.customer.create({
        data: {
          name,
          phone,
          email,
          tier,
          active: true,
          loyaltyPoints: points,
          totalEarned: points,
          totalRedeemed: 0,
        },
      })
      customerCount++
    }

    return successResponse({
      message: 'تم إنشاء البيانات التجريبية بنجاح',
      counts: {
        products: productCount,
        customers: customerCount,
        suppliers: supplierIds.length,
        categories: categories.length,
      },
      store: { id: store.id, name: store.name },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return errorResponse(`فشل إنشاء البيانات التجريبية: ${msg}`, 500)
  }
}
