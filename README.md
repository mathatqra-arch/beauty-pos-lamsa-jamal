# لمسة جمال - نظام نقاط البيع لمستحضرات التجميل

## Beauty Store POS System

نظام POS احترافي متكامل لمحل مستحضرات تجميل، مع دعم offline-first، مزامنة سحابية، وأمان حقيقي.

## 🔒 الأمان

- **RLS (Row Level Security)**: جميع جداول Supabase محمية — الـ anon key لا يمكنه الوصول لأي بيانات
- **Signed Tokens**: توكنات موقعة بـ HMAC-SHA256 (مش مجرد userId)
- **Service Role Key**: مفتاح الخادم فقط (server-side)، لا يُكشف للمتصفح أبداً
- **RBAC**: 5 أدوار (مدير، مشرف، كاشير، أمين مخزن، محاسب) بصلاحيات منفصلة

## 🏗️ المعمارية

```
Browser/PWA
  ↓ HTTPS
Next.js API Routes (server-side)
  ↓ Supabase REST API (service_role key)
Supabase PostgreSQL
  + RLS policies (authenticated only)
  + RPC functions (atomic transactions)
  + Invoice sequence (no race conditions)
```

### قاعدة البيانات
- **Supabase PostgreSQL** (السحابة) — Source of truth
- **Dexie/IndexedDB** (المحلي) — للعمل offline في POS

### المزامنة
- كل عملية بيع لها `clientTxnId` (UUID) — idempotency
- محرك مزامنة يرفع/يسحب التغييرات كل 15 ثانية
- multi-device: جهاز A ينشئ بيع → Supabase → جهاز B يسحبه

## 🚀 التشغيل

```bash
bun install
bun run dev
```

## 🔑 بيانات الدخول

| المستخدم | كلمة المرور | الدور |
|---------|------------|-------|
| `admin` | `admin123` | مدير المتجر |
| `platform` | `platform123` | مدير المنصة |

## 📦 الإعداد

1. أنشئ مشروع Supabase
2. نفّذ `security-fix.sql` في SQL Editor
3. أضف متغيرات البيئة في Vercel
4. Deploy

## 🌐 الروابط
- **الريبو:** https://github.com/mathatqra-arch/beauty-pos-lamsa-jamal
