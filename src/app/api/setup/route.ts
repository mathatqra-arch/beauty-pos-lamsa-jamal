import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { successResponse, errorResponse } from '@/lib/auth'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// POST /api/setup — initialize the system with first admin + seed data
// SECURITY:
// - Rate limited: 5 attempts per hour per IP (blocks setup race attack)
// - admin PIN is now null (must be set after first login, not '1111')
// - All errors return generic message
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 setup attempts per hour per IP
    const limited = applyRateLimit(req, 'setup', RATE_LIMITS.SETUP)
    if (limited) return limited

    // Check if already set up
    const existingUsers = await db.user.count()
    if (existingUsers > 0) {
      return errorResponse('النظام تم إعداده بالفعل', 400)
    }

    const body = await req.json()
    const { adminName, adminUsername, adminPassword, storeName } = body

    if (!adminName || !adminUsername || !adminPassword) {
      return errorResponse('بيانات المدير مطلوبة (الاسم، المستخدم، كلمة المرور)')
    }

    if (adminPassword.length < 6) {
      return errorResponse('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10)

    // 1. Create store
    const store = await db.store.create({
      data: {
        name: storeName || 'لمسة جمال - مستحضرات تجميل',
        address: '',
        phone: '',
        currency: 'EGP',
        receiptFooter: 'لمسة جمال - جمالكِ يبدأ من هنا ✨',
      }
    })

    // 2. Create warehouse
    const warehouse = await db.warehouse.create({
      data: { name: 'المخزن الرئيسي', storeId: store.id }
    })

    // 3. Create register
    await db.register.create({
      data: { name: 'كاشير 1', storeId: store.id }
    })

    // 4. Create admin user — PIN is null (must be set explicitly after first login)
    const admin = await db.user.create({
      data: {
        email: `${adminUsername}@beauty-pos.com`,
        username: adminUsername,
        passwordHash,
        name: adminName,
        role: 'ADMIN',
        permissions: JSON.stringify(['all']),
        pin: null,  // ← SECURITY: was previously hardcoded '1111'
      }
    })

    // 5. Create default categories (main + sub)
    const mainCats = [
      { name: 'Perfumes', nameAr: 'العطور', color: '#e11d48' },
      { name: 'Makeup', nameAr: 'المكياج', color: '#ec4899' },
      { name: 'Skincare', nameAr: 'العناية بالبشرة', color: '#8b5cf6' },
      { name: 'Haircare', nameAr: 'العناية بالشعر', color: '#f59e0b' },
      { name: 'Body Care', nameAr: 'العناية بالجسم', color: '#10b981' },
      { name: 'Beauty Tools', nameAr: 'أدوات التجميل', color: '#06b6d4' },
      { name: 'Mens Grooming', nameAr: 'العناية بالرجل', color: '#6366f1' },
      { name: 'Offers', nameAr: 'العروض', color: '#ef4444' },
    ]
    for (const c of mainCats) {
      await db.category.create({ data: c })
    }

    // 6. Create units
    const units = [
      { name: 'Piece', shortName: 'pcs' },
      { name: 'Bottle', shortName: 'btl' },
      { name: 'Tube', shortName: 'tube' },
      { name: 'Jar', shortName: 'jar' },
      { name: 'Pack', shortName: 'pack' },
    ]
    for (const u of units) {
      await db.unit.create({ data: u })
    }

    // 7. Create expense categories
    const expCats = [
      { name: 'Rent', nameAr: 'إيجار', color: '#ef4444' },
      { name: 'Electricity', nameAr: 'كهرباء', color: '#f59e0b' },
      { name: 'Internet', nameAr: 'إنترنت', color: '#3b82f6' },
      { name: 'Salary', nameAr: 'رواتب', color: '#10b981' },
      { name: 'Transport', nameAr: 'مواصلات', color: '#8b5cf6' },
      { name: 'Other', nameAr: 'أخرى', color: '#6b7280' },
    ]
    for (const c of expCats) {
      await db.expenseCategory.create({ data: c })
    }

    // 8. Create loyalty tiers
    await db.loyaltyTier.createMany({
      data: [
        { name: 'BRONZE', displayName: 'برونزي', minPoints: 0, earningMultiplier: 1.0, discountPercent: 0, color: '#cd7f32' },
        { name: 'SILVER', displayName: 'فضي', minPoints: 500, earningMultiplier: 1.2, discountPercent: 5, color: '#c0c0c0' },
        { name: 'GOLD', displayName: 'ذهبي', minPoints: 1500, earningMultiplier: 1.5, discountPercent: 10, color: '#ffd700' },
        { name: 'VIP', displayName: 'VIP', minPoints: 3000, earningMultiplier: 2.0, discountPercent: 15, color: '#9333ea' },
      ]
    })

    // 9. Create settings
    await db.setting.createMany({
      data: [
        { key: 'loyalty.enabled', value: 'true', category: 'loyalty' },
        { key: 'loyalty.pointsPerEgp', value: '0.1', category: 'loyalty' },
        { key: 'loyalty.egpPerPoint', value: '0.05', category: 'loyalty' },
        { key: 'loyalty.minRedeem', value: '500', category: 'loyalty' },
        { key: 'tax.defaultRate', value: '14', category: 'tax' },
        { key: 'receipt.width', value: '80', category: 'receipt' },
        { key: 'receipt.autoPrint', value: 'true', category: 'receipt' },
        { key: 'receipt.cutPaper', value: 'true', category: 'receipt' },
        { key: 'receipt.openDrawer', value: 'true', category: 'receipt' },
        { key: 'currency', value: 'EGP', category: 'general' },
        { key: 'language', value: 'ar', category: 'general' },
        { key: 'store.name', value: storeName || 'لمسة جمال', category: 'general' },
        { key: 'system.locked', value: 'false', category: 'system' },
      ]
    })

    return successResponse({
      admin: { id: admin.id, username: admin.username, name: admin.name },
      store: { id: store.id, name: store.name },
      message: 'تم إعداد النظام بنجاح! يمكنك الآن تسجيل الدخول',
    }, 'تم الإعداد بنجاح')
  } catch (e: unknown) {
    console.error('[setup] error:', e)
    return errorResponse('فشل إعداد النظام', 500)
  }
}
