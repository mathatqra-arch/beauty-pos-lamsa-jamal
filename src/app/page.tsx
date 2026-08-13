'use client'

import { useEffect, useState, Suspense, lazy } from 'react'
import { useAuthStore, useUIStore } from '@/lib/store'
import { initLocalDB } from '@/lib/local-db'
import { startSyncEngine, stopSyncEngine } from '@/lib/sync-engine'
import { isDesktop } from '@/lib/desktop-mode'
import { Sparkles } from 'lucide-react'
import { LoginScreen } from '@/components/pos/login-screen'
import { SetupScreen } from '@/components/pos/setup-screen'
import { Sidebar } from '@/components/layout/sidebar'
import { ModuleErrorBoundary } from '@/components/error-boundary'

// ============================================================
// CODE SPLITTING — Lazy-load modules to reduce initial bundle
// ============================================================
// Previously all 18 modules were imported statically, causing
// a >800KB initial bundle. Now each module is loaded on demand
// via next/dynamic (React.lazy). Only the active module is
// downloaded, reducing initial load time significantly.
// ============================================================

const DashboardModule = lazy(() => import('@/components/modules/dashboard').then(m => ({ default: m.DashboardModule })))
const POSModule = lazy(() => import('@/components/modules/pos').then(m => ({ default: m.POSModule })))
const ProductsModule = lazy(() => import('@/components/modules/products').then(m => ({ default: m.ProductsModule })))
const InventoryModule = lazy(() => import('@/components/modules/inventory').then(m => ({ default: m.InventoryModule })))
const SalesModule = lazy(() => import('@/components/modules/sales').then(m => ({ default: m.SalesModule })))
const CustomersModule = lazy(() => import('@/components/modules/customers').then(m => ({ default: m.CustomersModule })))
const LoyaltyModule = lazy(() => import('@/components/modules/loyalty').then(m => ({ default: m.LoyaltyModule })))
const PurchasesModule = lazy(() => import('@/components/modules/purchases').then(m => ({ default: m.PurchasesModule })))
const SuppliersModule = lazy(() => import('@/components/modules/suppliers').then(m => ({ default: m.SuppliersModule })))
const CashModule = lazy(() => import('@/components/modules/cash').then(m => ({ default: m.CashModule })))
const ExpensesModule = lazy(() => import('@/components/modules/expenses').then(m => ({ default: m.ExpensesModule })))
const ReportsModule = lazy(() => import('@/components/modules/reports').then(m => ({ default: m.ReportsModule })))
const AuditModule = lazy(() => import('@/components/modules/audit').then(m => ({ default: m.AuditModule })))
const SettingsModule = lazy(() => import('@/components/modules/settings').then(m => ({ default: m.SettingsModule })))
const CategoriesModule = lazy(() => import('@/components/modules/categories').then(m => ({ default: m.CategoriesModule })))
const EmployeesModule = lazy(() => import('@/components/modules/employees').then(m => ({ default: m.EmployeesModule })))
const OfflineTestModule = lazy(() => import('@/components/modules/offline-test').then(m => ({ default: m.OfflineTestModule })))
const DesktopDownload = lazy(() => import('@/components/modules/desktop-download').then(m => ({ default: m.DesktopDownload })))
const PlatformAdminModule = lazy(() => import('@/components/modules/platform-admin').then(m => ({ default: m.PlatformAdminModule })))

// Module loading fallback
function ModuleLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-3 animate-pulse">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">جاري تحميل الوحدة...</p>
      </div>
    </div>
  )
}

// Module name mapping for error boundary
const MODULE_NAMES: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  pos: 'نقطة البيع',
  products: 'المنتجات',
  categories: 'الفئات',
  inventory: 'المخزون',
  sales: 'المبيعات',
  customers: 'العملاء',
  loyalty: 'الولاء',
  purchases: 'المشتريات',
  suppliers: 'الموردين',
  cash: 'الدرج',
  expenses: 'المصروفات',
  reports: 'التقارير',
  employees: 'الموظفين',
  'offline-test': 'اختبار Offline',
  desktop: 'تحميل Desktop',
  audit: 'سجل التدقيق',
  settings: 'الإعدادات',
}

export default function Home() {
  const { user } = useAuthStore()
  const { activeModule, theme } = useUIStore()
  const [setupStatus, setSetupStatus] = useState<'loading' | 'needs-setup' | 'ready'>('loading')

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    let mounted = true
    const checkSetup = async () => {
      try {
        const res = await fetch('/api/setup-db')
        const data = await res.json()
        if (mounted) {
          if (data.data?.tablesExist === false || data.data?.needsSetup) {
            setSetupStatus('needs-setup')
          } else {
            setSetupStatus('ready')
          }
        }
      } catch (e) {
        if (mounted) setSetupStatus('needs-setup')
      }
    }
    checkSetup()
    return () => { mounted = false }
  }, [])

  // Initialize local DB + sync engine when user logs in
  useEffect(() => {
    if (user && setupStatus === 'ready') {
      if (!isDesktop()) {
        initLocalDB().catch(e => console.error('[LocalDB] init error:', e))
        startSyncEngine()
        return () => stopSyncEngine()
      }
    }
  }, [user, setupStatus])

  if (setupStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 animate-pulse">
            <Sparkles className="w-8 h-8" />
          </div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (setupStatus === 'needs-setup' && !user) {
    return <SetupScreen onComplete={() => setSetupStatus('ready')} />
  }

  if (!user) return <LoginScreen />

  if (user.role === 'PLATFORM_ADMIN') {
    return (
      <Suspense fallback={<ModuleLoader />}>
        <PlatformAdminModule />
      </Suspense>
    )
  }

  const renderModule = () => {
    const moduleName = MODULE_NAMES[activeModule] || 'الوحدة'

    const wrap = (el: React.ReactNode) => (
      <ModuleErrorBoundary moduleName={moduleName}>
        <Suspense fallback={<ModuleLoader />}>
          {el}
        </Suspense>
      </ModuleErrorBoundary>
    )

    switch (activeModule) {
      case 'dashboard': return wrap(<DashboardModule />)
      case 'pos': return wrap(<POSModule />)
      case 'products': return wrap(<ProductsModule />)
      case 'categories': return wrap(<CategoriesModule />)
      case 'inventory': return wrap(<InventoryModule />)
      case 'sales': return wrap(<SalesModule />)
      case 'customers': return wrap(<CustomersModule />)
      case 'loyalty': return wrap(<LoyaltyModule />)
      case 'purchases': return wrap(<PurchasesModule />)
      case 'suppliers': return wrap(<SuppliersModule />)
      case 'cash': return wrap(<CashModule />)
      case 'expenses': return wrap(<ExpensesModule />)
      case 'reports': return wrap(<ReportsModule />)
      case 'employees': return wrap(<EmployeesModule />)
      case 'offline-test': return wrap(<OfflineTestModule />)
      case 'desktop': return wrap(<DesktopDownload />)
      case 'audit': return wrap(<AuditModule />)
      case 'settings': return wrap(<SettingsModule />)
      default: return wrap(<DashboardModule />)
    }
  }

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1">
          {renderModule()}
        </div>
      </main>
    </div>
  )
}
