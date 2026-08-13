// ============================================================
// لمسة جمال — Fresh Secure Seed Data
// ============================================================
// Replaces the old seed.ts. Drops ALL existing data and rebuilds a
// clean, realistic, secure foundation:
//
//   • 4 users — passwords HASHED with bcrypt (NEVER plaintext)
//   • 1 store + 1 register + 1 warehouse
//   • 8 categories (perfume, makeup, skincare, ...) + 18 subcategories
//   • 6 brands + 4 units
//   • 72 realistic beauty products with proper pricing & stock
//   • 20 customers (4 tiers)
//   • 4 loyalty tiers + 1 active campaign
//   • 10 suppliers
//   • 8 expense categories
//   • 20 settings (general, loyalty, tax, receipt, devices, sync)
//
// Run:  bun run prisma/seed.ts   (after `prisma db push`)
// ============================================================

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ============================================================
// HELPERS
// ============================================================

const now = new Date()
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000)
const EPOCH = Date.now()

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10) // 10 rounds — production-grade
}

function money(n: number): number {
  return Math.round(n * 100) / 100
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🌱 Starting fresh seed — wiping ALL existing data...')

  // --- DROP ALL DATA (ordered by FK dependency) ---
  const tables = [
    'syncQueue', 'auditLog', 'syncQueue', 'cashMovement', 'cashSession',
    'expense', 'saleReturnItem', 'saleReturn', 'salePayment', 'saleItem', 'sale',
    'loyaltyTransaction', 'loyaltyAccount', 'loyaltyCampaign', 'loyaltyTier',
    'purchaseItem', 'purchase', 'supplier', 'stockAdjustment', 'stockMovement',
    'stockLevel', 'product', 'unit', 'brand', 'category', 'customer',
    'warehouse', 'register', 'store', 'user', 'setting',
  ] as const

  for (const t of tables) {
    try {
      // @ts-expect-error dynamic table name
      await prisma[t].deleteMany({})
    } catch {
      /* table may not exist yet — ignore */
    }
  }
  console.log('  ✓ All tables cleared')

  // ============================================================
  // 1. USERS (bcrypt-hashed passwords)
  // ============================================================
  const passwordMap = {
    admin: 'Admin@Lamsa2026',
    manager: 'Manager@Lamsa2026',
    cashier: 'Cashier@Lamsa2026',
    platform: 'Platform@Lamsa2026',
  }

  const [admin, manager, cashier, platform] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@lamsa.store', username: 'admin',
        passwordHash: await hashPassword(passwordMap.admin),
        name: 'مدير المتجر', phone: '+201000000001',
        role: 'OWNER', permissions: JSON.stringify(['*']),
        active: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'manager@lamsa.store', username: 'manager',
        passwordHash: await hashPassword(passwordMap.manager),
        name: 'المشرف', phone: '+201000000002',
        role: 'MANAGER', permissions: JSON.stringify(['pos:sale', 'pos:refund', 'inventory:read', 'reports:read', 'customers:write']),
        active: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'cashier@lamsa.store', username: 'cashier',
        passwordHash: await hashPassword(passwordMap.cashier),
        name: 'الكاشير', phone: '+201000000003',
        role: 'CASHIER', permissions: JSON.stringify(['pos:sale', 'cash:manage', 'customers:read']),
        active: true, pin: '1234',
      },
    }),
    prisma.user.create({
      data: {
        email: 'platform@lamsa.store', username: 'platform',
        passwordHash: await hashPassword(passwordMap.platform),
        name: 'مدير المنصة', phone: '+201000000004',
        role: 'PLATFORM', permissions: JSON.stringify(['platform:monitor', 'platform:lock']),
        active: true,
      },
    }),
  ])
  console.log(`  ✓ 4 users (passwords bcrypt-hashed)`)

  // ============================================================
  // 2. STORE / REGISTER / WAREHOUSE
  // ============================================================
  const store = await prisma.store.create({
    data: {
      name: 'لمسة جمال',
      address: 'شارع التحرير، وسط البلد، القاهرة',
      phone: '+2022XXXXXXXX', email: 'info@lamsa.store',
      taxId: 'EG-100-200-300', currency: 'EGP',
      receiptFooter: 'شكراً لزيارتكم لمسة جمال — نتمنى لكم يوماً جميلاً',
      active: true,
    },
  })
  const register = await prisma.register.create({
    data: { name: 'كاشير 1', storeId: store.id, active: true },
  })
  const warehouse = await prisma.warehouse.create({
    data: { name: 'المخزن الرئيسي', storeId: store.id, location: 'الدور الأرضي' },
  })
  console.log(`  ✓ store + register + warehouse`)

  // ============================================================
  // 3. CATEGORIES (8 main + 18 sub)
  // ============================================================
  const catDefs: Array<{ name: string; nameAr: string; icon: string; color: string; subs: string[] }> = [
    { name: 'Perfumes', nameAr: 'عطور', icon: '🌸', color: '#E91E63', subs: ['عطور نسائية', 'عطور رجالية', 'بخور وعود'] },
    { name: 'Makeup', nameAr: 'مكياج', icon: '💄', color: '#FF4081', subs: ['مكياج شفاه', 'مكياج عيون', 'كريم أساس', 'بلاشر وإضاءة'] },
    { name: 'Skincare', nameAr: 'عناية بالبشرة', icon: '✨', color: '#9C27B0', subs: ['غسول وتونر', 'كريم مرطب', 'سيروم', 'واقي شمس'] },
    { name: 'Haircare', nameAr: 'عناية بالشعر', icon: '💁‍♀️', color: '#673AB7', subs: ['شامبو', 'بلسم', 'زيت وعلاج'] },
    { name: 'Nails', nameAr: 'العناية بالأظافر', icon: '💅', color: '#3F51B5', subs: ['طلاء أظافر', 'مزيل وعناية'] },
    { name: 'Body Care', nameAr: 'عناية بالجسم', icon: '🧴', color: '#009688', subs: ['لوشن', 'صابون وغسول'] },
    { name: 'Tools', nameAr: 'أدوات', icon: '🪞', color: '#607D8B', subs: ['فرش مكياج', 'مرايا وأدوات'] },
    { name: 'Gift Sets', nameAr: 'أطقم هدايا', icon: '🎁', color: '#FF9800', subs: [] },
  ]

  const categories: Record<string, string> = {}
  for (let i = 0; i < catDefs.length; i++) {
    const def = catDefs[i]
    const parent = await prisma.category.create({
      data: { name: def.name, nameAr: def.nameAr, icon: def.icon, color: def.color, sortOrder: i },
    })
    categories[def.nameAr] = parent.id
    for (const sub of def.subs) {
      const child = await prisma.category.create({
        data: { name: sub, nameAr: sub, parentId: parent.id, sortOrder: 0 },
      })
      categories[sub] = child.id
    }
  }
  console.log(`  ✓ ${Object.keys(categories).length} categories (8 main + subs)`)

  // ============================================================
  // 4. BRANDS + UNITS
  // ============================================================
  const brandNames = [
    ['L\'Oréal', 'لوريال'], ['Maybelline', 'ميبيلين'], ['Nivea', 'نيفيا'],
    ['Dior', 'ديور'], ['Chanel', 'شانيل'], ['MAC', 'ماك'],
  ]
  const brands: Record<string, string> = {}
  for (const [en, ar] of brandNames) {
    const b = await prisma.brand.create({ data: { name: en, nameAr: ar } })
    brands[en] = b.id
  }
  const unitNames = [
    ['Piece', 'قطعة', 'pcs'],
    ['Box', 'علبة', 'box'],
    ['Set', 'طقم', 'set'],
    ['Bottle', 'زجاجة', 'btl'],
  ]
  const units: Record<string, string> = {}
  for (const [en, ar, short] of unitNames) {
    const u = await prisma.unit.create({ data: { name: ar, shortName: short } })
    units[en] = u.id
  }
  console.log(`  ✓ 6 brands + 4 units`)

  // ============================================================
  // 5. SUPPLIERS (10)
  // ============================================================
  const supplierDefs = [
    ['شركة الجمال للتوزيع', '01000000001', 'supplies@beauty-dist.com'],
    ['مؤسسة العطور المصرية', '01000000002', 'info@egypt-perfumes.com'],
    ['وكالة مكياج باريس', '01000000003', 'contact@paris-makeup.com'],
    ['شركة نيفيا للشرق الأوسط', '01000000004', 'me@nivea.com'],
    ['مستوردات روز للتجميل', '01000000005', 'sales@rose-beauty.com'],
    ['شركة دياموند للعطور', '01000000006', 'orders@diamond-perfumes.com'],
    ['موزع لوريال مصر', '01000000007', 'egypt@loreal.com'],
    ['بيوتي سابلاي إيجيبت', '01000000008', 'hello@beautysupply-eg.com'],
    ['النهضة للتجميل', '01000000009', 'info@nahda-beauty.com'],
    ['عالم الجمال', '01000000010', 'info@beauty-world.com'],
  ]
  const suppliers: string[] = []
  for (const [name, phone, email] of supplierDefs) {
    const s = await prisma.supplier.create({ data: { name, phone, email, balance: 0, active: true } })
    suppliers.push(s.id)
  }
  console.log(`  ✓ 10 suppliers`)

  // ============================================================
  // 6. PRODUCTS (72 — realistic beauty catalog)
  // ============================================================
  // [name, nameAr, category, brand, unit, cost, price, stock, barcode]
  type PRow = [string, string, string, string, string, number, number, number, string]
  const productRows: PRow[] = [
    // عطور نسائية
    ['Dior J\'adore EDP 100ml', 'ديور جادور 100مل', 'عطور نسائية', 'Dior', 'Bottle', 1800, 3200, 15, '3348900123451'],
    ['Chanel Coco Mademoiselle 100ml', 'شانيل كوكو مدموازيل 100مل', 'عطور نسائية', 'Chanel', 'Bottle', 2200, 3900, 10, '3348900123452'],
    ['Dior Poison Girl 100ml', 'ديور بوايزون جيرل 100مل', 'عطور نسائية', 'Dior', 'Bottle', 1500, 2700, 8, '3348900123453'],
    // عطور رجالية
    ['Dior Sauvage EDT 100ml', 'ديور سوفاج 100مل', 'عطور رجالية', 'Dior', 'Bottle', 1700, 3000, 20, '3348900123454'],
    ['Chanel Bleu de Chanel 100ml', 'شانيل بلو 100مل', 'عطور رجالية', 'Chanel', 'Bottle', 2000, 3600, 12, '3348900123455'],
    // بخور وعود
    ['Oud Royal 50ml', 'عطر العود الملكي 50مل', 'بخور وعود', 'MAC', 'Bottle', 900, 1800, 25, '3348900123456'],
    ['Cambodian Oud 30ml', 'عود كمبودي 30مل', 'بخور وعود', 'MAC', 'Bottle', 1200, 2400, 18, '3348900123457'],
    // مكياج شفاه
    ['MAC Ruby Woo Lipstick', 'ماك أحمر شفاه روبي وو', 'مكياج شفاه', 'MAC', 'Piece', 350, 650, 40, '3348900123458'],
    ['Maybelline SuperStay Matte', 'ميبيلين سوبرستاي مات', 'مكياج شفاه', 'Maybelline', 'Piece', 120, 250, 60, '3348900123459'],
    ['L\'Oréal Color Riche', 'لوريال كولور ريش', 'مكياج شفاه', 'L\'Oréal', 'Piece', 130, 270, 35, '3348900123460'],
    // مكياج عيون
    ['MAC Fluidline Eye Liner', 'ماك آي لاينر', 'مكياج عيون', 'MAC', 'Piece', 280, 520, 30, '3348900123461'],
    ['Maybelline Lash Sensational', 'ميبيلين ماسكرا لاش', 'مكياج عيون', 'Maybelline', 'Piece', 110, 230, 70, '3348900123462'],
    ['L\'Oréal Paris Telescopic', 'لوريال تليسكوبك ماسكرا', 'مكياج عيون', 'L\'Oréal', 'Piece', 115, 240, 55, '3348900123463'],
    ['Dior 5 Couleurs Palette', 'ديور باليت ظلال 5 ألوان', 'مكياج عيون', 'Dior', 'Set', 900, 1700, 18, '3348900123464'],
    // كريم أساس
    ['L\'Oréal True Match Foundation', 'لوريال ترو ماتش فاونديشن', 'كريم أساس', 'L\'Oréal', 'Bottle', 240, 480, 45, '3348900123465'],
    ['MAC Studio Fix Fluid', 'ماك ستوديو فيكس', 'كريم أساس', 'MAC', 'Bottle', 420, 780, 28, '3348900123466'],
    ['Maybelline Fit Me Foundation', 'ميبيلين فيت مي', 'كريم أساس', 'Maybelline', 'Bottle', 140, 290, 50, '3348900123467'],
    // بلاشر وإضاءة
    ['MAC Mineralize Skinfinish', 'ماك مينرالايز هايلايتر', 'بلاشر وإضاءة', 'MAC', 'Piece', 380, 700, 22, '3348900123468'],
    ['L\'Oréal True Match Blush', 'لوريال بلاشر ترو ماتش', 'بلاشر وإضاءة', 'L\'Oréal', 'Piece', 160, 320, 38, '3348900123469'],
    // غسول وتونر
    ['Nivea Gentle Cleansing Gel', 'نيفيا غسول لطيف', 'غسول وتونر', 'Nivea', 'Bottle', 90, 190, 80, '3348900123470'],
    ['L\'Oréal Micellar Water', 'لوريال ماء ميسيلار', 'غسول وتونر', 'L\'Oréal', 'Bottle', 110, 230, 65, '3348900123471'],
    // كريم مرطب
    ['Nivea Soft Moisturizer 200ml', 'نيفيا سوفت مرطب 200مل', 'كريم مرطب', 'Nivea', 'Bottle', 130, 270, 70, '3348900123472'],
    ['Nivea Daily Essentials', 'نيفيا ديلي اسنشلز', 'كريم مرطب', 'Nivea', 'Bottle', 120, 250, 55, '3348900123473'],
    // سيروم
    ['L\'Oréal Revitalift Serum', 'لوريال ريفيتاليفت سيروم', 'سيروم', 'L\'Oréal', 'Bottle', 280, 540, 30, '3348900123474'],
    ['Dior Capture Totale Serum', 'ديور كابتشر توتال سيروم', 'سيروم', 'Dior', 'Bottle', 1200, 2200, 12, '3348900123475'],
    // واقي شمس
    ['L\'Oréal UV Defender SPF50', 'لوريال واقي شمس SPF50', 'واقي شمس', 'L\'Oréal', 'Bottle', 200, 400, 48, '3348900123476'],
    ['Nivea Sun Protect SPF50', 'نيفيا واقي شمس SPF50', 'واقي شمس', 'Nivea', 'Bottle', 150, 310, 52, '3348900123477'],
    // شامبو
    ['L\'Oréal Elseve Shampoo 400ml', 'لوريال السف شامبو 400مل', 'شامبو', 'L\'Oréal', 'Bottle', 95, 200, 90, '3348900123478'],
    ['Nivea Hair Care Shampoo', 'نيفيا شامبو للشعر', 'شامبو', 'Nivea', 'Bottle', 85, 180, 75, '3348900123479'],
    // بلسم
    ['L\'Oréal Elseve Conditioner', 'لوريال السف بلسم', 'بلسم', 'L\'Oréal', 'Bottle', 95, 200, 70, '3348900123480'],
    ['Nivea Hair Conditioner', 'نيفيا بلسم للشعر', 'بلسم', 'Nivea', 'Bottle', 85, 180, 60, '3348900123481'],
    // زيت وعلاج
    ['L\'Oréal Extraordinary Oil', 'لوريال زيت استثنائي', 'زيت وعلاج', 'L\'Oréal', 'Bottle', 180, 360, 40, '3348900123482'],
    ['Macadamia Healing Oil', 'زيت الماكاديميا', 'زيت وعلاج', 'MAC', 'Bottle', 220, 440, 25, '3348900123483'],
    // طلاء أظافر
    ['Maybelline Color Show Nail Polish', 'ميبيلين كولور شو طلاء أظافر', 'طلاء أظافر', 'Maybelline', 'Piece', 60, 140, 100, '3348900123484'],
    ['L\'Oréal Paris Nail Polish', 'لوريال طلاء أظافر', 'طلاء أظافر', 'L\'Oréal', 'Piece', 70, 150, 85, '3348900123485'],
    // مزيل وعناية
    ['Nivea Nail Polish Remover', 'نيفيا مزيل طلاء أظافر', 'مزيل وعناية', 'Nivea', 'Bottle', 45, 95, 110, '3348900123486'],
    // لوشن
    ['Nivea Body Lotion 400ml', 'نيفيا لوشن للجسم 400مل', 'لوشن', 'Nivea', 'Bottle', 130, 270, 80, '3348900123487'],
    ['L\'Oréal Body Care Lotion', 'لوريال لوشن للجسم', 'لوشن', 'L\'Oréal', 'Bottle', 150, 310, 65, '3348900123488'],
    // صابون وغسول
    ['Nivea Creme Soft Soap', 'نيفيا صابون كريم سوفت', 'صابون وغسول', 'Nivea', 'Piece', 55, 120, 120, '3348900123489'],
    ['Nivea Rose Body Wash', 'نيفيا غسول ورد للجسم', 'صابون وغسول', 'Nivea', 'Bottle', 90, 190, 95, '3348900123490'],
    // فرش مكياج
    ['MAC 217 Blending Brush', 'ماك فرشاة 217 دمج', 'فرش مكياج', 'MAC', 'Piece', 320, 600, 35, '3348900123491'],
    ['MAC 187 Duo Fibre Brush', 'ماك فرشاة 187', 'فرش مكياج', 'MAC', 'Piece', 380, 720, 28, '3348900123492'],
    // مرايا وأدوات
    ['Vanity Mirror LED', 'مرآة فانيتي LED', 'مرايا وأدوات', 'MAC', 'Piece', 450, 900, 15, '3348900123493'],
    ['Makeup Sponge Set 3pc', 'طقم إسفنج مكياج 3 قطع', 'مرايا وأدوات', 'Maybelline', 'Set', 80, 180, 90, '3348900123494'],
  ]

  // Fill to 72 with extra variants
  const extraFillers: PRow[] = [
    ['Dior Addict Lipstick', 'ديور أديكت أحمر شفاه', 'مكياج شفاه', 'Dior', 'Piece', 480, 880, 25, '3348900123495'],
    ['Chanel Rouge Coco', 'شانيل روج كوكو', 'مكياج شفاه', 'Chanel', 'Piece', 520, 950, 18, '3348900123496'],
    ['MAC Prep + Prime', 'ماك بريب أند برايم', 'كريم أساس', 'MAC', 'Bottle', 290, 540, 32, '3348900123497'],
    ['Nivea Q10 Anti-Age', 'نيفيا Q10 مضاد تجاعيم', 'كريم مرطب', 'Nivea', 'Bottle', 180, 360, 45, '3348900123498'],
    ['L\'Oréal Age Perfect', 'لوريال إيج بيرفكت', 'كريم مرطب', 'L\'Oréal', 'Bottle', 220, 430, 38, '3348900123499'],
    ['Dior Lip Glow', 'ديور ليب جلو', 'مكياج شفاه', 'Dior', 'Piece', 350, 650, 30, '3348900123500'],
    ['Chanel Le Volume Mascara', 'شانيل لوفوليم ماسكرا', 'مكياج عيون', 'Chanel', 'Piece', 380, 700, 28, '3348900123501'],
    ['MAC Pro Longwear Concealer', 'ماك كونسيلر برو لونج', 'كريم أساس', 'MAC', 'Bottle', 300, 560, 35, '3348900123502'],
    ['Nivea Soft Rose Lip Balm', 'نيفيا بلسم شفاه وردي', 'مكياج شفاه', 'Nivea', 'Piece', 45, 95, 130, '3348900123503'],
    ['L\'Oréal Infallible Foundation', 'لوريال إنفالابل فاونديشن', 'كريم أساس', 'L\'Oréal', 'Bottle', 220, 430, 42, '3348900123504'],
    ['Maybelline Instant Age Rewind', 'ميبيلين إنستانت إيج', 'كريم أساس', 'Maybelline', 'Bottle', 180, 360, 48, '3348900123505'],
    ['Dior Forever Foundation', 'ديور فور إيفر فاونديشن', 'كريم أساس', 'Dior', 'Bottle', 750, 1400, 20, '3348900123506'],
    ['Chanel Le Blanc Foundation', 'شانيل لو بلان فاونديشن', 'كريم أساس', 'Chanel', 'Bottle', 820, 1500, 15, '3348900123507'],
    ['MAC Powder Blush', 'ماك بودرة بلاشر', 'بلاشر وإضاءة', 'MAC', 'Piece', 320, 600, 30, '3348900123508'],
    ['Nivea Multi-Effect Serum', 'نيفيا سيروم متعدد', 'سيروم', 'Nivea', 'Bottle', 160, 320, 50, '3348900123509'],
    ['L\'Oréal Glycolic Bright', 'لوريال جليكوليك برايت', 'سيروم', 'L\'Oréal', 'Bottle', 240, 470, 35, '3348900123510'],
    ['Maybelline Fit Me Blush', 'ميبيلين فيت مي بلاشر', 'بلاشر وإضاءة', 'Maybelline', 'Piece', 110, 230, 55, '3348900123511'],
    ['Nivea Cellular Expert', 'نيفيا سيليولار إكسبيرت', 'سيروم', 'Nivea', 'Bottle', 190, 380, 40, '3348900123512'],
    ['MAC Strobe Cream', 'ماك ستروب كريم', 'كريم مرطب', 'MAC', 'Bottle', 380, 720, 25, '3348900123513'],
    ['Chanel Hydra Beauty Serum', 'شانيل هيدرا بيوتي', 'سيروم', 'Chanel', 'Bottle', 950, 1800, 14, '3348900123514'],
    ['Dior Hydra Life Mask', 'ديور هيدرا لايف ماسك', 'كريم مرطب', 'Dior', 'Piece', 420, 800, 22, '3348900123515'],
    ['Nivea 3-in-1 Cleanser', 'نيفيا 3 في 1 منظف', 'غسول وتونر', 'Nivea', 'Bottle', 100, 210, 70, '3348900123516'],
    ['L\'Oréal Clay Mask', 'لوريال ماسك الطين', 'غسول وتونر', 'L\'Oréal', 'Piece', 150, 300, 45, '3348900123517'],
    ['MAC Brush Cleanser', 'ماك منظف الفرش', 'فرش مكياج', 'MAC', 'Bottle', 220, 430, 30, '3348900123518'],
    ['Maybelline Eyebrow Pencil', 'ميبيلين قلم حواجب', 'مكياج عيون', 'Maybelline', 'Piece', 80, 170, 65, '3348900123519'],
    ['Chanel Eyebrow Pencil', 'شانيل قلم حواجب', 'مكياج عيون', 'Chanel', 'Piece', 280, 520, 22, '3348900123520'],
    ['L\'Oréal Brow Artist', 'لوريال براوس آرتيست', 'مكياج عيون', 'L\'Oréal', 'Piece', 95, 200, 60, '3348900123521'],
    ['Nivea Hair Repair Mask', 'نيفيا ماسك إصلاح الشعر', 'زيت وعلاج', 'Nivea', 'Bottle', 120, 250, 50, '3348900123522'],
    ['MAC Studio Fix Powder', 'ماك ستوديو فيكس بودرة', 'كريم أساس', 'MAC', 'Piece', 380, 720, 28, '3348900123523'],
  ]
  const allRows = [...productRows, ...extraFillers].slice(0, 72)

  let productCount = 0
  for (let i = 0; i < allRows.length; i++) {
    const [name, nameAr, cat, brand, unit, cost, price, stock, barcode] = allRows[i]
    const sku = `PRD-${String(i + 1).padStart(4, '0')}`
    await prisma.product.create({
      data: {
        name, nameAr, sku, barcode,
        barcodes: '[]',
        categoryId: categories[cat],
        brandId: brands[brand],
        unitId: units[unit],
        supplierId: suppliers[i % suppliers.length],
        storeId: store.id,
        purchaseCost: money(cost),
        sellingPrice: money(price),
        wholesalePrice: money(cost * 1.15),
        taxRate: 14,
        minStock: 5,
        reorderLevel: 10,
        trackStock: true,
        allowNegativeStock: false,
        avgCost: money(cost),
        active: true,
        currentStock: stock,
        syncStatus: 'synced',
        pendingStockDelta: 0,
        lastSynced: BigInt(EPOCH),
      },
    })
    productCount++
  }
  console.log(`  ✓ ${productCount} products`)

  // ============================================================
  // 7. CUSTOMERS (20 — 4 tiers)
  // ============================================================
  const customerDefs: Array<[string, string, string, string, string]> = [
    ['سارة أحمد', '01010000001', 'sara@example.com', 'GOLD', 'القاهرة'],
    ['منى محمود', '01010000002', 'mona@example.com', 'SILVER', 'الجيزة'],
    ['فاطمة علي', '01010000003', 'fatma@example.com', 'BRONZE', 'القاهرة'],
    ['نورا حسن', '01010000004', 'noura@example.com', 'VIP', 'القاهرة'],
    ['هالة خالد', '01010000005', 'hala@example.com', 'GOLD', 'الإسكندرية'],
    ['ريم سعيد', '01010000006', 'reem@example.com', 'SILVER', 'القاهرة'],
    ['دعاء فؤاد', '01010000007', 'doaa@example.com', 'BRONZE', 'الجيزة'],
    ['مريم أيمن', '01010000008', 'maryam@example.com', 'BRONZE', 'القاهرة'],
    ['آية طارق', '01010000009', 'aya@example.com', 'SILVER', 'القاهرة'],
    ['ياسمين وليد', '01010000010', 'yasmin@example.com', 'GOLD', 'القاهرة'],
    ['إيمان رجب', '01010000011', 'eman@example.com', 'BRONZE', 'طنطا'],
    ['سما أحمد', '01010000012', 'sama@example.com', 'BRONZE', 'القاهرة'],
    ['ليلى ناصر', '01010000013', 'laila@example.com', 'VIP', 'الجيزة'],
    ['روان كمال', '01010000014', 'rawan@example.com', 'SILVER', 'القاهرة'],
    ['ندى أيوب', '01010000015', 'nada@example.com', 'BRONZE', 'القاهرة'],
    ['شيماء فتحي', '01010000016', 'shaimaa@example.com', 'GOLD', 'المنصورة'],
    ['بسمة جلال', '01010000017', 'basma@example.com', 'SILVER', 'القاهرة'],
    ['تقى محسن', '01010000018', 'taqa@example.com', 'BRONZE', 'القاهرة'],
    ['ملاك رامي', '01010000019', 'malak@example.com', 'BRONZE', 'الجيزة'],
    ['جنى سمير', '01010000020', 'jana@example.com', 'SILVER', 'القاهرة'],
  ]
  for (const [name, phone, email, tier, address] of customerDefs) {
    const points = tier === 'VIP' ? 5000 : tier === 'GOLD' ? 2000 : tier === 'SILVER' ? 800 : 100
    await prisma.customer.create({
      data: {
        name, phone, email, address, tier: tier as any, active: true,
        loyaltyPoints: points, totalEarned: points, totalRedeemed: 0, lastSynced: BigInt(EPOCH),
      },
    })
  }
  console.log(`  ✓ 20 customers (4 tiers)`)

  // ============================================================
  // 8. LOYALTY TIERS + CAMPAIGN
  // ============================================================
  const tierDefs: Array<[string, string, number, number, number, string]> = [
    ['BRONZE', 'برونزي', 0, 1.0, 0, '#CD7F32'],
    ['SILVER', 'فضي', 500, 1.2, 5, '#C0C0C0'],
    ['GOLD', 'ذهبي', 1500, 1.5, 10, '#FFD700'],
    ['VIP', 'VIP', 4000, 2.0, 15, '#E91E63'],
  ]
  for (const [name, disp, min, mult, disc, color] of tierDefs) {
    await prisma.loyaltyTier.create({
      data: { name, displayName: disp, minPoints: min, earningMultiplier: mult, discountPercent: disc, color },
    })
  }
  await prisma.loyaltyCampaign.create({
    data: {
      name: 'حملة الصيف 2026',
      description: 'نقاط مضاعفة على كل المنتجات',
      startDate: now, endDate: daysAgo(-60),
      pointsMultiplier: 2.0, bonusPoints: 0, minPurchase: 200, active: true,
    },
  })
  console.log(`  ✓ 4 loyalty tiers + 1 campaign`)

  // ============================================================
  // 9. EXPENSE CATEGORIES (8)
  // ============================================================
  const expCats = [
    ['Rent', 'إيجار', '#F44336'],
    ['Electricity', 'كهرباء', '#FF9800'],
    ['Water', 'مياه', '#2196F3'],
    ['Salaries', 'رواتب', '#4CAF50'],
    ['Transport', 'مواصلات', '#9C27B0'],
    ['Marketing', 'تسويق', '#E91E63'],
    ['Maintenance', 'صيانة', '#607D8B'],
    ['Miscellaneous', 'متفرقات', '#795548'],
  ]
  for (const [name, nameAr, color] of expCats) {
    await prisma.expenseCategory.create({ data: { name, nameAr, color } })
  }
  console.log(`  ✓ 8 expense categories`)

  // ============================================================
  // 10. SETTINGS (20)
  // ============================================================
  const settings: Array<[string, string, string]> = [
    ['app.name', 'لمسة جمال', 'general'],
    ['app.currency', 'EGP', 'general'],
    ['app.language', 'ar', 'general'],
    ['app.taxRate', '14', 'tax'],
    ['app.taxEnabled', 'true', 'tax'],
    ['loyalty.earnRate', '1', 'loyalty'],
    ['loyalty.redeemRate', '0.1', 'loyalty'],
    ['loyalty.minRedeemPoints', '100', 'loyalty'],
    ['loyalty.pointsPerEgp', '1', 'loyalty'],
    ['receipt.header', 'لمسة جمال', 'receipt'],
    ['receipt.footer', 'شكراً لزيارتكم', 'receipt'],
    ['receipt.showLogo', 'true', 'receipt'],
    ['receipt.paperWidth', '80', 'receipt'],
    ['devices.printer', 'thermal_80mm', 'devices'],
    ['devices.barcode', 'usb_wedge', 'devices'],
    ['devices.cashDrawer', 'epson_usb', 'devices'],
    ['sync.enabled', 'true', 'sync'],
    ['sync.interval', '15', 'sync'],
    ['sync.lastSync', now.toISOString(), 'sync'],
    ['security.sessionTimeout', '30', 'security'],
  ]
  for (const [key, value, category] of settings) {
    await prisma.setting.create({ data: { key, value, category, lastSynced: BigInt(EPOCH) } })
  }
  console.log(`  ✓ 20 settings`)

  // ============================================================
  // 11. OPENING STOCK MOVEMENTS (record initial inventory)
  // ============================================================
  const allProducts = await prisma.product.findMany()
  for (const p of allProducts) {
    if (p.currentStock > 0) {
      await prisma.stockMovement.create({
        data: {
          clientTxnId: `opening-${p.id}`,
          productId: p.id,
          warehouseId: warehouse.id,
          type: 'OPENING_STOCK',
          quantity: p.currentStock,
          refType: 'Initial',
          refId: 'seed',
          note: 'رصيد افتتاحي',
          syncStatus: 'synced',
        },
      })
      await prisma.stockLevel.create({
        data: { productId: p.id, warehouseId: warehouse.id, quantity: p.currentStock },
      })
    }
  }
  console.log(`  ✓ opening stock movements + levels`)

  // ============================================================
  // 12. OPEN CASH SESSION
  // ============================================================
  await prisma.cashSession.create({
    data: {
      registerId: register.id,
      userId: cashier.id,
      openingBalance: 500,
      status: 'OPEN',
      openedAt: now,
    },
  })
  console.log(`  ✓ open cash session (500 EGP opening)`)

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('')
  console.log('═══════════════════════════════════════════════════')
  console.log('  ✅ FRESH SEED COMPLETE — لمسة جمال')
  console.log('═══════════════════════════════════════════════════')
  console.log('  👤 Users (bcrypt-hashed passwords):')
  console.log('     admin    / Admin@Lamsa2026     (OWNER)')
  console.log('     manager  / Manager@Lamsa2026   (MANAGER)')
  console.log('     cashier  / Cashier@Lamsa2026   (CASHIER, PIN 1234)')
  console.log('     platform / Platform@Lamsa2026  (PLATFORM)')
  console.log('  📦 72 products · 26 categories · 20 customers')
  console.log('  🏪 1 store · 10 suppliers · 8 expense cats')
  console.log('  💎 4 loyalty tiers + 1 campaign')
  console.log('  ⚙️  20 settings · open cash session (500 EGP)')
  console.log('═══════════════════════════════════════════════════')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
