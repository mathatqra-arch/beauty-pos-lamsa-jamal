import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

async function main() {
  console.log('🌱 Seeding beauty store database...')

  // Clear existing data
  await db.syncQueue.deleteMany()
  await db.auditLog.deleteMany()
  await db.expense.deleteMany()
  await db.expenseCategory.deleteMany()
  await db.cashMovement.deleteMany()
  await db.cashSession.deleteMany()
  await db.saleReturnItem.deleteMany()
  await db.saleReturn.deleteMany()
  await db.salePayment.deleteMany()
  await db.saleItem.deleteMany()
  await db.sale.deleteMany()
  await db.loyaltyTransaction.deleteMany()
  await db.loyaltyAccount.deleteMany()
  await db.loyaltyCampaign.deleteMany()
  await db.loyaltyTier.deleteMany()
  await db.stockAdjustment.deleteMany()
  await db.stockMovement.deleteMany()
  await db.stockLevel.deleteMany()
  await db.purchaseItem.deleteMany()
  await db.purchase.deleteMany()
  await db.supplier.deleteMany()
  await db.product.deleteMany()
  await db.category.deleteMany()
  await db.brand.deleteMany()
  await db.unit.deleteMany()
  await db.customer.deleteMany()
  await db.register.deleteMany()
  await db.warehouse.deleteMany()
  await db.store.deleteMany()
  await db.user.deleteMany()
  await db.setting.deleteMany()

  // ============ USERS ============
  const adminPass = await bcrypt.hash('admin123', 10)
  const managerPass = await bcrypt.hash('manager123', 10)
  const cashierPass = await bcrypt.hash('cashier123', 10)
  const platformPass = await bcrypt.hash('platform123', 10)

  // Platform Admin (manages the platform, not store details)
  const platformAdmin = await db.user.create({
    data: {
      email: 'platform@beauty.com', username: 'platform', passwordHash: platformPass,
      name: 'مدير المنصة', role: 'PLATFORM_ADMIN', phone: '01000000000',
      permissions: JSON.stringify(['platform.all']),
      pin: '0000',
    }
  })

  const admin = await db.user.create({
    data: {
      email: 'admin@beauty.com', username: 'admin', passwordHash: adminPass,
      name: 'سارة مديرة المتجر', role: 'ADMIN', phone: '01000000001',
      permissions: JSON.stringify(['all']),
      pin: '1111',
    }
  })
  const manager = await db.user.create({
    data: {
      email: 'manager@beauty.com', username: 'manager', passwordHash: managerPass,
      name: 'منى المشرفة', role: 'MANAGER', phone: '01000000002',
      permissions: JSON.stringify(['sale.create','sale.refund','sale.discount','product.edit','inventory.adjust','report.view','profit.view','cash.open','cash.close']),
      pin: '2222',
    }
  })
  const cashier = await db.user.create({
    data: {
      email: 'cashier@beauty.com', username: 'cashier', passwordHash: cashierPass,
      name: 'هدى الكاشيرة', role: 'CASHIER', phone: '01000000003',
      permissions: JSON.stringify(['sale.create','cash.open','cash.close']),
      pin: '3333',
    }
  })

  // ============ STORE & WAREHOUSE ============
  const store = await db.store.create({
    data: {
      name: 'لمسة جمال - مستحضرات تجميل', address: 'شارع التحرير، وسط البلد، القاهرة',
      phone: '0223456789', email: 'info@lamsa-beauty.com', currency: 'EGP',
      receiptFooter: 'لمسة جمال - جمالكِ يبدأ من هنا ✨',
    }
  })
  const warehouse = await db.warehouse.create({
    data: { name: 'مخزن المستحضرات', storeId: store.id, location: 'القاهرة' }
  })
  const register = await db.register.create({
    data: { name: 'كاشير 1', storeId: store.id }
  })

  // ============ CATEGORIES (with subcategories) ============
  // Main categories (parentId = null) and subcategories (parentId = main)
  const mainCategories = [
    { name: 'Perfumes', nameAr: 'العطور', color: '#e11d48', icon: 'Sparkles' },
    { name: 'Makeup', nameAr: 'المكياج', color: '#ec4899', icon: 'Palette' },
    { name: 'Skincare', nameAr: 'العناية بالبشرة', color: '#8b5cf6', icon: 'Heart' },
    { name: 'Haircare', nameAr: 'العناية بالشعر', color: '#f59e0b', icon: 'Wind' },
    { name: 'Body Care', nameAr: 'العناية بالجسم', color: '#10b981', icon: 'Flower2' },
    { name: 'Beauty Tools', nameAr: 'أدوات التجميل', color: '#06b6d4', icon: 'Wrench' },
    { name: 'Mens Grooming', nameAr: 'العناية بالرجل', color: '#6366f1', icon: 'User' },
    { name: 'Offers', nameAr: 'العروض', color: '#ef4444', icon: 'Tag' },
  ]
  const mainCatRecords = await Promise.all(
    mainCategories.map(c => db.category.create({ data: c }))
  )
  const mainCatMap = Object.fromEntries(mainCatRecords.map(c => [c.name, c]))

  // Subcategories
  const subcategories = [
    // Perfumes
    { name: 'Womens Perfume', nameAr: 'عطور نسائية', parent: 'Perfumes', color: '#e11d48' },
    { name: 'Mens Perfume', nameAr: 'عطور رجالية', parent: 'Perfumes', color: '#be123c' },
    { name: 'Body Mist', nameAr: 'بادي ميست', parent: 'Perfumes', color: '#fb7185' },
    // Makeup
    { name: 'Lip Products', nameAr: 'مكياج الشفاه', parent: 'Makeup', color: '#ec4899' },
    { name: 'Eye Makeup', nameAr: 'مكياج العيون', parent: 'Makeup', color: '#db2777' },
    { name: 'Face Makeup', nameAr: 'مكياج الوجه', parent: 'Makeup', color: '#f472b6' },
    { name: 'Nail Polish', nameAr: 'طلاء الأظافر', parent: 'Makeup', color: '#be185d' },
    // Skincare
    { name: 'Cleansers', nameAr: 'منظفات', parent: 'Skincare', color: '#8b5cf6' },
    { name: 'Moisturizers', nameAr: 'مرطبات', parent: 'Skincare', color: '#7c3aed' },
    { name: 'Serums', nameAr: 'سيروم', parent: 'Skincare', color: '#a78bfa' },
    { name: 'Sunscreen', nameAr: 'واقي شمس', parent: 'Skincare', color: '#c4b5fd' },
    // Haircare
    { name: 'Shampoo', nameAr: 'شامبو', parent: 'Haircare', color: '#f59e0b' },
    { name: 'Conditioner', nameAr: 'بلسم', parent: 'Haircare', color: '#fbbf24' },
    { name: 'Hair Treatments', nameAr: 'علاجات الشعر', parent: 'Haircare', color: '#fcd34d' },
    // Body Care
    { name: 'Body Lotion', nameAr: 'لوشن جسم', parent: 'Body Care', color: '#10b981' },
    { name: 'Bath Products', nameAr: 'مستحضرات استحمام', parent: 'Body Care', color: '#34d399' },
    // Beauty Tools
    { name: 'Brushes', nameAr: 'فرش مكياج', parent: 'Beauty Tools', color: '#06b6d4' },
    { name: 'Accessories', nameAr: 'إكسسوارات', parent: 'Beauty Tools', color: '#22d3ee' },
  ]
  const subCatRecords = await Promise.all(
    subcategories.map(s => db.category.create({
      data: { name: s.name, nameAr: s.nameAr, parentId: mainCatMap[s.parent].id, color: s.color }
    }))
  )

  // Build a map of all categories by name (main + sub)
  const allCategories = [...mainCatRecords, ...subCatRecords]
  const catMap = Object.fromEntries(allCategories.map(c => [c.name, c]))

  // ============ BRANDS ============
  const brands = ['Chanel','Dior','Maybelline','L\'Oreal','MAC','Nivea','Neutrogena','Garnier','Olaplex','Tresemme','Pantene','Head & Shoulders','Calvin Klein','Gucci','Versace','Hugo Boss','Local','Wet n Wild','NYX','Fenty Beauty']
  const brandRecords = await Promise.all(brands.map(b => db.brand.create({ data: { name: b } })))

  // ============ UNITS ============
  const units = [
    { name: 'Piece', shortName: 'pcs' },
    { name: 'Box', shortName: 'box' },
    { name: 'Bottle', shortName: 'btl' },
    { name: 'Tube', shortName: 'tube' },
    { name: 'Jar', shortName: 'jar' },
    { name: 'Pack', shortName: 'pack' },
    { name: 'Set', shortName: 'set' },
    { name: 'ml', shortName: 'ml' },
  ]
  const unitRecords = await Promise.all(units.map(u => db.unit.create({ data: u })))
  const unitMap = new Map(unitRecords.map(u => [u.name, u]))

  // ============ SUPPLIERS ============
  const suppliers = [
    { name: 'شركة الجمال للعطور', phone: '01111111111', email: 'info@beauty-perfumes.com', address: 'القاهرة', balance: 0 },
    { name: 'مورد المستحضرات العالمية', phone: '01122222222', email: 'info@global-cosmetics.com', address: 'الجيزة', balance: 15000 },
    { name: 'شركة المكياج الحديث', phone: '01133333333', email: 'info@modern-makeup.com', address: 'الإسكندرية', balance: 0 },
    { name: 'مورد العناية بالبشرة', phone: '01144444444', address: 'القاهرة', balance: 8000 },
    { name: 'شركة منتجات الشعر', phone: '01155555555', email: 'info@hair-pro.com', address: 'المنوفية', balance: 0 },
    { name: 'مورد أدوات التجميل', phone: '01166666666', address: 'القاهرة', balance: 3000 },
    { name: 'المورد المتحد للجمال', phone: '01177777777', email: 'info@united-beauty.com', address: 'أسيوط', balance: 12000 },
    { name: 'شركة العطور الفاخرة', phone: '01188888888', address: 'القاهرة', balance: 0 },
    { name: 'مورد منتجات الرجال', phone: '01199999999', address: 'القاهرة', balance: 0 },
    { name: 'شركة التوزيع الجميل', phone: '01200000000', email: 'info@beauty-dist.com', address: 'القاهرة', balance: 5000 },
  ]
  const supplierRecords = await Promise.all(suppliers.map(s => db.supplier.create({ data: s })))

  // ============ PRODUCTS (55+ beauty products) ============
  // Format: { name, nameAr, cat (subcategory name), brand, unit, supplier index, cost, price, stock, barcode, min }
  const productsData = [
    // === PERFUMES ===
    { name: 'Chanel No.5 EDP 100ml', nameAr: 'شانيل رقم 5 100مل', cat: 'Womens Perfume', brand: 'Chanel', unit: 'Bottle', supplier: 7, cost: 1800, price: 3200, stock: 25, barcode: '3145890012345', min: 5 },
    { name: 'Dior J\'adore EDP 100ml', nameAr: 'ديور جادور 100مل', cat: 'Womens Perfume', brand: 'Dior', unit: 'Bottle', supplier: 7, cost: 1600, price: 2900, stock: 30, barcode: '3348900012345', min: 5 },
    { name: 'Gucci Bloom 100ml', nameAr: 'غوتشي بلوم 100مل', cat: 'Womens Perfume', brand: 'Gucci', unit: 'Bottle', supplier: 7, cost: 1500, price: 2700, stock: 20, barcode: '7370520012345', min: 5 },
    { name: 'Calvin Klein Eternity 100ml', nameAr: 'كالفن كلاين إيترنتي 100مل', cat: 'Mens Perfume', brand: 'Calvin Klein', unit: 'Bottle', supplier: 7, cost: 1200, price: 2200, stock: 35, barcode: '8830010012345', min: 8 },
    { name: 'Hugo Boss Bottled 100ml', nameAr: 'هوغو بوس بوتلد 100مل', cat: 'Mens Perfume', brand: 'Hugo Boss', unit: 'Bottle', supplier: 7, cost: 1300, price: 2400, stock: 28, barcode: '7370520012346', min: 6 },
    { name: 'Versace Eros 100ml', nameAr: 'فرساتشي إيروس 100مل', cat: 'Mens Perfume', brand: 'Versace', unit: 'Bottle', supplier: 7, cost: 1400, price: 2500, stock: 22, barcode: '8011000012345', min: 5 },
    { name: 'Body Mist Vanilla 250ml', nameAr: 'بادي ميست فانيلا 250مل', cat: 'Body Mist', brand: 'Local', unit: 'Bottle', supplier: 0, cost: 120, price: 250, stock: 80, barcode: '2000000000017', min: 20 },
    { name: 'Body Mist Rose 250ml', nameAr: 'بادي ميست ورد 250مل', cat: 'Body Mist', brand: 'Local', unit: 'Bottle', supplier: 0, cost: 120, price: 250, stock: 75, barcode: '2000000000024', min: 20 },

    // === MAKEUP - LIPS ===
    { name: 'Matte Lipstick Red', nameAr: 'أحمر شفاه مطفي أحمر', cat: 'Lip Products', brand: 'MAC', unit: 'Piece', supplier: 2, cost: 250, price: 480, stock: 60, barcode: '7736020012345', min: 15 },
    { name: 'Matte Lipstick Pink', nameAr: 'أحمر شفاه مطفي وردي', cat: 'Lip Products', brand: 'MAC', unit: 'Piece', supplier: 2, cost: 250, price: 480, stock: 55, barcode: '7736020012346', min: 15 },
    { name: 'Lip Gloss Clear', nameAr: 'جلو شفاف للشفاه', cat: 'Lip Products', brand: 'Maybelline', unit: 'Tube', supplier: 2, cost: 90, price: 180, stock: 90, barcode: '8840010012345', min: 20 },
    { name: 'Lip Liner Nude', nameAr: 'قلم تحديد شفاه نود', cat: 'Lip Products', brand: 'NYX', unit: 'Piece', supplier: 2, cost: 70, price: 140, stock: 100, barcode: '8008970012345', min: 25 },
    { name: 'Liquid Lipstick Mauve', nameAr: 'أحمر شفاه سائل موف', cat: 'Lip Products', brand: 'Fenty Beauty', unit: 'Tube', supplier: 2, cost: 180, price: 350, stock: 40, barcode: '8840010012346', min: 10 },

    // === MAKEUP - EYES ===
    { name: 'Mascara Volume', nameAr: 'ماسكارا فوليوم', cat: 'Eye Makeup', brand: 'Maybelline', unit: 'Tube', supplier: 2, cost: 110, price: 220, stock: 85, barcode: '8840010012347', min: 20 },
    { name: 'Mascara Waterproof', nameAr: 'ماسكارا ووتربروف', cat: 'Eye Makeup', brand: 'L\'Oreal', unit: 'Tube', supplier: 2, cost: 130, price: 250, stock: 70, barcode: '8840010012348', min: 18 },
    { name: 'Eyeliner Black', nameAr: 'آيلاينر أسود', cat: 'Eye Makeup', brand: 'Maybelline', unit: 'Tube', supplier: 2, cost: 80, price: 160, stock: 95, barcode: '8840010012349', min: 20 },
    { name: 'Eyeshadow Palette Nude', nameAr: 'باليت ظلال عيون نود', cat: 'Eye Makeup', brand: 'NYX', unit: 'Box', supplier: 2, cost: 220, price: 420, stock: 45, barcode: '8008970012346', min: 10 },
    { name: 'Eyeshadow Palette Colorful', nameAr: 'باليت ظلال عيون ملون', cat: 'Eye Makeup', brand: 'Wet n Wild', unit: 'Box', supplier: 2, cost: 180, price: 350, stock: 38, barcode: '8008970012347', min: 10 },
    { name: 'Eyebrow Pencil Brown', nameAr: 'قلم حواجب بني', cat: 'Eye Makeup', brand: 'MAC', unit: 'Piece', supplier: 2, cost: 140, price: 280, stock: 65, barcode: '7736020012347', min: 15 },
    { name: 'False Eyelashes Set', nameAr: 'طقم رموش صناعية', cat: 'Eye Makeup', brand: 'Local', unit: 'Pack', supplier: 2, cost: 50, price: 120, stock: 120, barcode: '2000000000031', min: 30 },

    // === MAKEUP - FACE ===
    { name: 'Foundation Light', nameAr: 'فاونديشن فاتح', cat: 'Face Makeup', brand: 'MAC', unit: 'Bottle', supplier: 2, cost: 350, price: 680, stock: 50, barcode: '7736020012348', min: 12 },
    { name: 'Foundation Medium', nameAr: 'فاونديشن متوسط', cat: 'Face Makeup', brand: 'MAC', unit: 'Bottle', supplier: 2, cost: 350, price: 680, stock: 48, barcode: '7736020012349', min: 12 },
    { name: 'Foundation Dark', nameAr: 'فاونديشن غامق', cat: 'Face Makeup', brand: 'L\'Oreal', unit: 'Bottle', supplier: 2, cost: 280, price: 550, stock: 42, barcode: '8840010012350', min: 10 },
    { name: 'BB Cream Natural', nameAr: 'بي بي كريم طبيعي', cat: 'Face Makeup', brand: 'Garnier', unit: 'Tube', supplier: 3, cost: 150, price: 290, stock: 70, barcode: '3600010012345', min: 15 },
    { name: 'Compact Powder', nameAr: 'بودرة مضغوطة', cat: 'Face Makeup', brand: 'Maybelline', unit: 'Box', supplier: 2, cost: 160, price: 310, stock: 60, barcode: '8840010012351', min: 15 },
    { name: 'Concealer Medium', nameAr: 'كونسيلر متوسط', cat: 'Face Makeup', brand: 'Maybelline', unit: 'Tube', supplier: 2, cost: 130, price: 260, stock: 55, barcode: '8840010012352', min: 12 },
    { name: 'Blush Pink', nameAr: 'بلاشر وردي', cat: 'Face Makeup', brand: 'MAC', unit: 'Box', supplier: 2, cost: 200, price: 390, stock: 40, barcode: '7736020012350', min: 10 },
    { name: 'Highlighter Gold', nameAr: 'هايلايتر ذهبي', cat: 'Face Makeup', brand: 'Wet n Wild', unit: 'Box', supplier: 2, cost: 140, price: 280, stock: 45, barcode: '8008970012348', min: 10 },
    { name: 'Setting Spray', nameAr: 'سبراي تثبيت المكياج', cat: 'Face Makeup', brand: 'NYX', unit: 'Bottle', supplier: 2, cost: 170, price: 330, stock: 50, barcode: '8008970012349', min: 12 },
    { name: 'Primer', nameAr: 'برايمر للوجه', cat: 'Face Makeup', brand: 'L\'Oreal', unit: 'Tube', supplier: 2, cost: 200, price: 390, stock: 38, barcode: '8840010012353', min: 10 },

    // === MAKEUP - NAILS ===
    { name: 'Nail Polish Red', nameAr: 'طلاء أظافر أحمر', cat: 'Nail Polish', brand: 'Local', unit: 'Bottle', supplier: 2, cost: 35, price: 75, stock: 150, barcode: '2000000000048', min: 30 },
    { name: 'Nail Polish Pink', nameAr: 'طلاء أظافر وردي', cat: 'Nail Polish', brand: 'Local', unit: 'Bottle', supplier: 2, cost: 35, price: 75, stock: 140, barcode: '2000000000055', min: 30 },
    { name: 'Nail Polish Black', nameAr: 'طلاء أظافر أسود', cat: 'Nail Polish', brand: 'Local', unit: 'Bottle', supplier: 2, cost: 35, price: 75, stock: 130, barcode: '2000000000062', min: 30 },
    { name: 'Nail Polish Remover', nameAr: 'مزيل طلاء الأظافر', cat: 'Nail Polish', brand: 'Local', unit: 'Bottle', supplier: 2, cost: 25, price: 55, stock: 100, barcode: '2000000000079', min: 25 },
    { name: 'Nail Polish Set 6', nameAr: 'طقم طلاء أظافر 6 ألوان', cat: 'Nail Polish', brand: 'Local', unit: 'Set', supplier: 2, cost: 150, price: 300, stock: 40, barcode: '2000000000086', min: 10 },

    // === SKINCARE ===
    { name: 'Facial Cleanser 200ml', nameAr: 'غسول وجه 200مل', cat: 'Cleansers', brand: 'Neutrogena', unit: 'Bottle', supplier: 3, cost: 120, price: 240, stock: 80, barcode: '3000000000018', min: 20 },
    { name: 'Micellar Water 400ml', nameAr: 'ماء ميسيلار 400مل', cat: 'Cleansers', brand: 'Garnier', unit: 'Bottle', supplier: 3, cost: 100, price: 200, stock: 90, barcode: '3600010012346', min: 20 },
    { name: 'Face Moisturizer 50ml', nameAr: 'مرطب وجه 50مل', cat: 'Moisturizers', brand: 'Nivea', unit: 'Jar', supplier: 3, cost: 140, price: 280, stock: 65, barcode: '4000010012345', min: 15 },
    { name: 'Day Cream SPF 50ml', nameAr: 'كريم نهار 50مل', cat: 'Moisturizers', brand: 'Neutrogena', unit: 'Jar', supplier: 3, cost: 180, price: 350, stock: 55, barcode: '3000000000025', min: 12 },
    { name: 'Night Cream 50ml', nameAr: 'كريم ليل 50مل', cat: 'Moisturizers', brand: 'Nivea', unit: 'Jar', supplier: 3, cost: 190, price: 370, stock: 48, barcode: '4000010012346', min: 12 },
    { name: 'Vitamin C Serum 30ml', nameAr: 'سيروم فيتامين سي 30مل', cat: 'Serums', brand: 'L\'Oreal', unit: 'Bottle', supplier: 3, cost: 250, price: 490, stock: 40, barcode: '8840010012354', min: 10 },
    { name: 'Hyaluronic Acid Serum', nameAr: 'سيروم حمض الهيالورونيك', cat: 'Serums', brand: 'Neutrogena', unit: 'Bottle', supplier: 3, cost: 220, price: 430, stock: 35, barcode: '3000000000032', min: 8 },
    { name: 'Retinol Serum 30ml', nameAr: 'سيروم ريتينول 30مل', cat: 'Serums', brand: 'L\'Oreal', unit: 'Bottle', supplier: 3, cost: 280, price: 550, stock: 30, barcode: '8840010012355', min: 8 },
    { name: 'Sunscreen SPF50 100ml', nameAr: 'واقي شمس SPF50 100مل', cat: 'Sunscreen', brand: 'Neutrogena', unit: 'Bottle', supplier: 3, cost: 200, price: 390, stock: 70, barcode: '3000000000049', min: 15 },
    { name: 'Sunscreen SPF30 100ml', nameAr: 'واقي شمس SPF30 100مل', cat: 'Sunscreen', brand: 'Nivea', unit: 'Bottle', supplier: 3, cost: 170, price: 330, stock: 65, barcode: '4000010012347', min: 15 },
    { name: 'Face Toner 200ml', nameAr: 'تونر وجه 200مل', cat: 'Cleansers', brand: 'Garnier', unit: 'Bottle', supplier: 3, cost: 110, price: 220, stock: 60, barcode: '3600010012347', min: 15 },
    { name: 'Eye Cream 15ml', nameAr: 'كريم العين 15مل', cat: 'Moisturizers', brand: 'Neutrogena', unit: 'Jar', supplier: 3, cost: 230, price: 450, stock: 42, barcode: '3000000000056', min: 10 },

    // === HAIRCARE ===
    { name: 'Shampoo Moisturizing 400ml', nameAr: 'شامبو مرطب 400مل', cat: 'Shampoo', brand: 'Pantene', unit: 'Bottle', supplier: 4, cost: 90, price: 180, stock: 100, barcode: '5000000000012', min: 25 },
    { name: 'Shampoo Anti Dandruff 400ml', nameAr: 'شامبو مضاد للقشرة 400مل', cat: 'Shampoo', brand: 'Head & Shoulders', unit: 'Bottle', supplier: 4, cost: 95, price: 190, stock: 90, barcode: '5000000000029', min: 25 },
    { name: 'Shampoo Repair 400ml', nameAr: 'شامبو إصلاح 400مل', cat: 'Shampoo', brand: 'Tresemme', unit: 'Bottle', supplier: 4, cost: 100, price: 200, stock: 85, barcode: '5000000000036', min: 20 },
    { name: 'Conditioner 400ml', nameAr: 'بلسم 400مل', cat: 'Conditioner', brand: 'Pantene', unit: 'Bottle', supplier: 4, cost: 95, price: 190, stock: 88, barcode: '5000000000043', min: 20 },
    { name: 'Hair Mask 300ml', nameAr: 'ماسك شعر 300مل', cat: 'Hair Treatments', brand: 'Olaplex', unit: 'Jar', supplier: 4, cost: 350, price: 680, stock: 30, barcode: '5000000000050', min: 8 },
    { name: 'Hair Oil 100ml', nameAr: 'زيت شعر 100مل', cat: 'Hair Treatments', brand: 'Local', unit: 'Bottle', supplier: 4, cost: 80, price: 160, stock: 95, barcode: '2000000000093', min: 20 },
    { name: 'Hair Serum 100ml', nameAr: 'سيروم شعر 100مل', cat: 'Hair Treatments', brand: 'Tresemme', unit: 'Bottle', supplier: 4, cost: 130, price: 260, stock: 55, barcode: '5000000000067', min: 12 },
    { name: 'Heat Protectant 200ml', nameAr: 'حماية من الحرارة 200مل', cat: 'Hair Treatments', brand: 'Tresemme', unit: 'Bottle', supplier: 4, cost: 110, price: 220, stock: 50, barcode: '5000000000074', min: 12 },

    // === BODY CARE ===
    { name: 'Body Lotion Lavender 400ml', nameAr: 'لوشن جسم لافندر 400مل', cat: 'Body Lotion', brand: 'Nivea', unit: 'Bottle', supplier: 6, cost: 110, price: 220, stock: 85, barcode: '4000010012348', min: 20 },
    { name: 'Body Lotion Shea 400ml', nameAr: 'لوشن جسم شيا 400مل', cat: 'Body Lotion', brand: 'Nivea', unit: 'Bottle', supplier: 6, cost: 115, price: 230, stock: 78, barcode: '4000010012349', min: 20 },
    { name: 'Body Wash Rose 500ml', nameAr: 'غسول جسم ورد 500مل', cat: 'Bath Products', brand: 'Garnier', unit: 'Bottle', supplier: 6, cost: 85, price: 170, stock: 100, barcode: '3600010012348', min: 25 },
    { name: 'Body Scrub Coffee 200g', nameAr: 'سكريب قهوة 200جم', cat: 'Bath Products', brand: 'Local', unit: 'Jar', supplier: 6, cost: 90, price: 180, stock: 60, barcode: '2000000000109', min: 15 },
    { name: 'Hand Cream 75ml', nameAr: 'كريم يدين 75مل', cat: 'Body Lotion', brand: 'Nivea', unit: 'Tube', supplier: 6, cost: 60, price: 120, stock: 110, barcode: '4000010012350', min: 25 },
    { name: 'Bath Salt Rose 500g', nameAr: 'ملح حمام وردي 500جم', cat: 'Bath Products', brand: 'Local', unit: 'Pack', supplier: 6, cost: 70, price: 150, stock: 55, barcode: '2000000000116', min: 15 },

    // === BEAUTY TOOLS ===
    { name: 'Makeup Brush Set 12', nameAr: 'طقم فرش مكياج 12 قطعة', cat: 'Brushes', brand: 'Local', unit: 'Set', supplier: 5, cost: 200, price: 400, stock: 40, barcode: '6000000000015', min: 10 },
    { name: 'Foundation Brush', nameAr: 'فرشاة فاونديشن', cat: 'Brushes', brand: 'Local', unit: 'Piece', supplier: 5, cost: 45, price: 95, stock: 80, barcode: '6000000000022', min: 20 },
    { name: 'Blush Brush', nameAr: 'فرشاة بلاشر', cat: 'Brushes', brand: 'Local', unit: 'Piece', supplier: 5, cost: 50, price: 105, stock: 70, barcode: '6000000000039', min: 15 },
    { name: 'Makeup Mirror LED', nameAr: 'مرايا مكياج LED', cat: 'Accessories', brand: 'Local', unit: 'Piece', supplier: 5, cost: 180, price: 350, stock: 25, barcode: '6000000000046', min: 5 },
    { name: 'Eyelash Curler', nameAr: 'ملعقة رموش', cat: 'Accessories', brand: 'Local', unit: 'Piece', supplier: 5, cost: 40, price: 85, stock: 65, barcode: '6000000000053', min: 15 },
    { name: 'Makeup Sponges Set 5', nameAr: 'طقم إسفنج مكياج 5 قطع', cat: 'Accessories', brand: 'Local', unit: 'Pack', supplier: 5, cost: 35, price: 80, stock: 90, barcode: '6000000000060', min: 20 },
    { name: 'Tweezers Set', nameAr: 'طقم ملاقط', cat: 'Accessories', brand: 'Local', unit: 'Set', supplier: 5, cost: 55, price: 110, stock: 50, barcode: '6000000000077', min: 12 },

    // === MENS GROOMING ===
    { name: 'Mens Face Wash 150ml', nameAr: 'غسول وجه رجالي 150مل', cat: 'Cleansers', brand: 'Nivea', unit: 'Tube', supplier: 8, cost: 95, price: 190, stock: 70, barcode: '4000010012351', min: 15 },
    { name: 'Mens Aftershave 100ml', nameAr: 'أفترشيف رجالي 100مل', cat: 'Mens Perfume', brand: 'Hugo Boss', unit: 'Bottle', supplier: 8, cost: 350, price: 680, stock: 30, barcode: '7370520012347', min: 8 },
    { name: 'Beard Oil 50ml', nameAr: 'زيت لحية 50مل', cat: 'Hair Treatments', brand: 'Local', unit: 'Bottle', supplier: 8, cost: 70, price: 140, stock: 60, barcode: '2000000000123', min: 15 },
    { name: 'Mens Deodorant 150ml', nameAr: 'مزيل عرق رجالي 150مل', cat: 'Body Mist', brand: 'Calvin Klein', unit: 'Bottle', supplier: 8, cost: 130, price: 260, stock: 55, barcode: '8830010012346', min: 12 },
  ]

  const productRecords: any[] = []
  for (let i = 0; i < productsData.length; i++) {
    const p = productsData[i]
    const category = catMap[p.cat]
    const brand = brandRecords.find(b => b.name === p.brand)
    const unit = unitMap.get(p.unit)
    const supplier = supplierRecords[p.supplier]
    const product = await db.product.create({
      data: {
        name: p.name, nameAr: p.nameAr, sku: `BTY-${String(i+1).padStart(4,'0')}`,
        barcode: p.barcode, categoryId: category.id, brandId: brand?.id, unitId: unit?.id,
        supplierId: supplier.id, storeId: store.id,
        purchaseCost: p.cost, sellingPrice: p.price, wholesalePrice: Math.round(p.price * 0.85),
        taxRate: 14, minStock: p.min, reorderLevel: Math.floor(p.min * 1.5),
        avgCost: p.cost, active: true,
      }
    })
    await db.stockLevel.create({
      data: { productId: product.id, warehouseId: warehouse.id, quantity: p.stock }
    })
    await db.stockMovement.create({
      data: { productId: product.id, warehouseId: warehouse.id, type: 'OPENING_STOCK',
        quantity: p.stock, refType: 'Opening', note: 'رصيد افتتاحي' }
    })
    productRecords.push({ ...product, cost: p.cost, price: p.price })
  }

  // ============ CUSTOMERS (20) ============
  const customerNames = [
    'نورا أحمد','فاطمة محمد','مريم خالد','سارة حسن','هدى محمود','منى سعيد',
    'أحمد علي','عمر فاروق','خالد إبراهيم','ريم حسني','دعاء أنور','أمل زكي',
    'ليلى ناصر','فريدة جمال','ماجد سمير','كريم عادل','حسام الدين','عبدالله فؤاد',
    'نور إسلام','جنى طارق'
  ]
  const customers: any[] = []
  for (let i = 0; i < customerNames.length; i++) {
    const c = await db.customer.create({
      data: {
        name: customerNames[i], phone: `010${String(i+1).padStart(8,'0')}`,
        email: `customer${i+1}@beauty.com`, address: `العنوان ${i+1}`,
        tier: i < 3 ? 'VIP' : i < 8 ? 'GOLD' : i < 14 ? 'SILVER' : 'BRONZE',
        birthday: new Date(1990 + i, i % 12, (i % 28) + 1),
      }
    })
    await db.loyaltyAccount.create({
      data: {
        customerId: c.id, points: Math.floor(Math.random() * 3000) + 100,
        totalEarned: Math.floor(Math.random() * 5000) + 500,
        totalRedeemed: Math.floor(Math.random() * 1000),
        tier: c.tier,
      }
    })
    customers.push(c)
  }

  // ============ LOYALTY TIERS ============
  await db.loyaltyTier.createMany({
    data: [
      { name: 'BRONZE', displayName: 'برونزي', minPoints: 0, earningMultiplier: 1.0, discountPercent: 0, color: '#cd7f32' },
      { name: 'SILVER', displayName: 'فضي', minPoints: 500, earningMultiplier: 1.2, discountPercent: 5, color: '#c0c0c0' },
      { name: 'GOLD', displayName: 'ذهبي', minPoints: 1500, earningMultiplier: 1.5, discountPercent: 10, color: '#ffd700' },
      { name: 'VIP', displayName: 'VIP', minPoints: 3000, earningMultiplier: 2.0, discountPercent: 15, color: '#9333ea' },
    ]
  })

  // ============ LOYALTY CAMPAIGN ============
  await db.loyaltyCampaign.create({
    data: {
      name: 'عرض الجمعة البيضاء - نقاط مضاعفة',
      description: 'نقاط مضاعفة على كل منتجات المكياج يوم الجمعة',
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      pointsMultiplier: 2.0, bonusPoints: 0, minPurchase: 200, active: true,
    }
  })

  // ============ EXPENSE CATEGORIES ============
  const expCats = [
    { name: 'Rent', nameAr: 'إيجار', color: '#ef4444' },
    { name: 'Electricity', nameAr: 'كهرباء', color: '#f59e0b' },
    { name: 'Internet', nameAr: 'إنترنت', color: '#3b82f6' },
    { name: 'Salary', nameAr: 'رواتب', color: '#10b981' },
    { name: 'Transport', nameAr: 'مواصلات', color: '#8b5cf6' },
    { name: 'Maintenance', nameAr: 'صيانة', color: '#ec4899' },
    { name: 'Marketing', nameAr: 'تسويق', color: '#06b6d4' },
    { name: 'Other', nameAr: 'أخرى', color: '#6b7280' },
  ]
  const expCatRecords = await Promise.all(expCats.map(c => db.expenseCategory.create({ data: c })))

  // ============ SALES (100+) ============
  const paymentMethods = ['CASH','CASH','CASH','CASH','CARD','CARD','TRANSFER']
  let invoiceCounter = 1001
  const now = new Date()
  
  for (let day = 30; day >= 0; day--) {
    const salesPerDay = Math.floor(Math.random() * 5) + 3
    for (let s = 0; s < salesPerDay; s++) {
      const saleDate = new Date(now.getTime() - day * 24 * 60 * 60 * 1000 - Math.random() * 8 * 60 * 60 * 1000)
      const itemCount = Math.floor(Math.random() * 4) + 1
      const items: any[] = []
      let subtotal = 0
      for (let it = 0; it < itemCount; it++) {
        const prod = productRecords[Math.floor(Math.random() * productRecords.length)]
        const qty = Math.floor(Math.random() * 3) + 1
        const total = prod.price * qty
        items.push({ product: prod, qty, unitPrice: prod.price, total, cost: prod.cost })
        subtotal += total
      }
      const discountAmount = Math.random() > 0.7 ? Math.round(subtotal * 0.05) : 0
      const taxAmount = Math.round((subtotal - discountAmount) * 0.14 * 100) / 100
      const total = subtotal - discountAmount + taxAmount
      const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)]
      const hasCustomer = Math.random() > 0.4
      const customer = hasCustomer ? customers[Math.floor(Math.random() * customers.length)] : null
      const user = Math.random() > 0.5 ? cashier : manager

      const sale = await db.sale.create({
        data: {
          invoiceNumber: `INV-${invoiceCounter++}`,
          customerId: customer?.id, userId: user.id, storeId: store.id, registerId: register.id,
          subtotal, discountAmount, discountType: discountAmount > 0 ? 'FIXED' : null,
          taxAmount, total, paidAmount: total, changeAmount: 0,
          status: 'COMPLETED', paymentMethod: method,
          loyaltyEarned: customer ? Math.floor(total / 10) : 0,
          createdAt: saleDate, updatedAt: saleDate,
          items: { create: items.map(it => ({
            productId: it.product.id, quantity: it.qty, unitPrice: it.unitPrice,
            discountAmount: 0, taxAmount: it.total * 0.14, total: it.total * 1.14, costAtSale: it.cost
          }))},
          payments: { create: { method, amount: total, createdAt: saleDate } },
        }
      })

      for (const it of items) {
        await db.stockLevel.updateMany({
          where: { productId: it.product.id, warehouseId: warehouse.id },
          data: { quantity: { decrement: it.qty } }
        })
        await db.stockMovement.create({
          data: { productId: it.product.id, warehouseId: warehouse.id, type: 'SALE',
            quantity: -it.qty, refType: 'Sale', refId: sale.id }
        })
      }

      if (customer && sale.loyaltyEarned > 0) {
        await db.loyaltyAccount.update({
          where: { customerId: customer.id },
          data: { points: { increment: sale.loyaltyEarned }, totalEarned: { increment: sale.loyaltyEarned } }
        })
        await db.loyaltyTransaction.create({
          data: { customerId: customer.id, type: 'EARN', points: sale.loyaltyEarned,
            refType: 'Sale', refId: sale.id, note: `نقاط من فاتورة ${sale.invoiceNumber}` }
        })
      }
    }
  }

  // ============ EXPENSES ============
  for (let day = 30; day >= 0; day -= 7) {
    const eDate = new Date(now.getTime() - day * 24 * 60 * 60 * 1000)
    await db.expense.create({ data: { categoryId: expCatRecords[0].id, userId: admin.id, amount: 8000, paymentMethod: 'CASH', note: 'إيجار المحل', date: eDate } })
    await db.expense.create({ data: { categoryId: expCatRecords[1].id, userId: admin.id, amount: 1200, paymentMethod: 'CASH', note: 'فاتورة كهرباء', date: eDate } })
    await db.expense.create({ data: { categoryId: expCatRecords[2].id, userId: admin.id, amount: 400, paymentMethod: 'CASH', note: 'إنترنت', date: eDate } })
    await db.expense.create({ data: { categoryId: expCatRecords[3].id, userId: admin.id, amount: 5000, paymentMethod: 'CASH', note: 'رواتب', date: eDate } })
    await db.expense.create({ data: { categoryId: expCatRecords[6].id, userId: admin.id, amount: 1500, paymentMethod: 'CARD', note: 'حملة إعلانية', date: eDate } })
  }

  // ============ SETTINGS ============
  await db.setting.createMany({
    data: [
      { key: 'loyalty.enabled', value: 'true', category: 'loyalty' },
      { key: 'loyalty.pointsPerEgp', value: '0.1', category: 'loyalty' },
      { key: 'loyalty.egpPerPoint', value: '0.05', category: 'loyalty' },
      { key: 'loyalty.minRedeem', value: '500', category: 'loyalty' },
      { key: 'tax.defaultRate', value: '14', category: 'tax' },
      { key: 'receipt.width', value: '80', category: 'receipt' },
      { key: 'receipt.showLogo', value: 'false', category: 'receipt' },
      { key: 'receipt.autoPrint', value: 'true', category: 'receipt' },
      { key: 'receipt.cutPaper', value: 'true', category: 'receipt' },
      { key: 'receipt.openDrawer', value: 'true', category: 'receipt' },
      { key: 'currency', value: 'EGP', category: 'general' },
      { key: 'language', value: 'ar', category: 'general' },
      { key: 'store.name', value: store.name, category: 'general' },
      { key: 'system.locked', value: 'false', category: 'system' },
      { key: 'system.lockedReason', value: '', category: 'system' },
      { key: 'system.platformMode', value: 'false', category: 'system' },
      { key: 'supabase.url', value: '', category: 'sync' },
      { key: 'supabase.key', value: '', category: 'sync' },
      { key: 'sync.enabled', value: 'false', category: 'sync' },
      { key: 'sync.lastSync', value: '', category: 'sync' },
    ]
  })

  console.log('✅ Beauty store seed complete!')
  console.log(`   Products: ${productRecords.length}`)
  console.log(`   Customers: ${customers.length}`)
  console.log(`   Suppliers: ${supplierRecords.length}`)
  console.log(`   Categories: ${allCategories.length} (main + sub)`)
  console.log(`   Demo login: admin/admin123, manager/manager123, cashier/cashier123`)
  console.log(`   Platform admin: platform/platform123`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
