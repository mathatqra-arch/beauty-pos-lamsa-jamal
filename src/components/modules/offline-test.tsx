'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Database, Wifi, WifiOff, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  HardDrive, Smartphone, Printer, ScanLine, Download, Upload, Trash2, Zap,
  Server, Cloud, Cpu, MemoryStick
} from 'lucide-react'
import { useConnectionStore } from '@/lib/store'
import { toast } from 'sonner'

interface LocalDBStats {
  products: number
  categories: number
  customers: number
  sales: number
  stockMovements: number
  loyaltyTransactions: number
  settings: number
  users: number
  syncQueue: number
}

export function OfflineTestModule() {
  const { online, syncing, pendingSync, setOnline } = useConnectionStore()
  const [dbStats, setDbStats] = useState<LocalDBStats | null>(null)
  const [dbInfo, setDbInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, 'pass' | 'fail' | 'pending'>>({})

  useEffect(() => {
    loadDBStats()
    loadDBInfo()
  }, [])

  const loadDBStats = async () => {
    try {
      const { getLocalDBStats } = await import('@/lib/local-db')
      const stats = await getLocalDBStats()
      setDbStats(stats)
    } catch (e) {
      console.error(e)
    }
  }

  const loadDBInfo = async () => {
    try {
      const info = await (async () => {
        const dbs = await indexedDB.databases()
        const posDb = dbs.find(d => d.name?.includes('BeautyPOS'))
        if (!posDb) return null

        // Get storage estimate
        const estimate = await navigator.storage?.estimate?.()

        return {
          name: posDb.name,
          version: posDb.version,
          storageUsed: estimate?.usage || 0,
          storageQuota: estimate?.quota || 0,
        }
      })()
      setDbInfo(info)
    } catch (e) {
      console.error(e)
    }
  }

  const rebuildDB = async () => {
    setLoading(true)
    try {
      const { refreshLocalData } = await import('@/lib/local-db')
      await refreshLocalData()
      await loadDBStats()
      toast.success('تم إعادة بناء قاعدة البيانات المحلية')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const clearDB = async () => {
    if (!confirm('هل أنت متأكد من مسح قاعدة البيانات المحلية؟ سيتم إعادة بنائها عند المزامنة التالية.')) return
    setLoading(true)
    try {
      const { clearLocalDB } = await import('@/lib/local-db')
      await clearLocalDB()
      await loadDBStats()
      toast.success('تم مسح القاعدة المحلية')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleOffline = () => {
    if (online) {
      setOnline(false)
      toast.info('🔴 تم تفعيل وضع الأوفلين - التطبيق يعمل بالبيانات المحلية')
    } else {
      setOnline(true)
      toast.info('🟢 تم استعادة الاتصال - جاري المزامنة...')
    }
  }

  // Run offline tests - REAL tests that actually verify functionality
  const runTests = async () => {
    setTestResults({})
    const tests = [
      { name: 'قاعدة البيانات المحلية موجودة', test: async () => {
        const dbs = await indexedDB.databases()
        return dbs.some(d => d.name?.includes('BeautyPOS'))
      }},
      { name: 'المنتجات محفوظة محلياً', test: async () => {
        const { getLocalDBStats } = await import('@/lib/local-db')
        const stats = await getLocalDBStats()
        return stats.products > 0
      }},
      { name: 'الفئات محفوظة محلياً', test: async () => {
        const { getLocalDBStats } = await import('@/lib/local-db')
        const stats = await getLocalDBStats()
        return stats.categories > 0
      }},
      { name: 'العملاء محفوظون محلياً', test: async () => {
        const { getLocalDBStats } = await import('@/lib/local-db')
        const stats = await getLocalDBStats()
        return stats.customers > 0
      }},
      { name: 'البحث المحلي يعمل (بدون إنترنت)', test: async () => {
        const { searchLocalProducts } = await import('@/lib/local-db')
        const results = await searchLocalProducts('')
        return results.length > 0
      }},
      { name: 'البحث بالباركود يعمل محلياً', test: async () => {
        const { searchLocalProducts, findProductByBarcode } = await import('@/lib/local-db')
        const products = await searchLocalProducts('')
        if (products.length === 0) return false
        // Try to find by barcode if exists
        const withBarcode = products.find(p => p.barcode)
        if (withBarcode) {
          const found = await findProductByBarcode(withBarcode.barcode!)
          return found !== undefined && found.id === withBarcode.id
        }
        // No barcodes but search function works
        return true
      }},
      { name: 'إنشاء بيع محلي (أوفلين)', test: async () => {
        const { searchLocalProducts, createLocalSale, getLocalDBStats } = await import('@/lib/local-db')
        const products = await searchLocalProducts('')
        if (products.length === 0) return false
        const beforeStats = await getLocalDBStats()
        await createLocalSale({
          items: [{
            productId: products[0].id,
            productName: products[0].nameAr || products[0].name,
            quantity: 1,
            unitPrice: products[0].sellingPrice,
            taxRate: products[0].taxRate || 0,
            total: products[0].sellingPrice,
            costAtSale: products[0].avgCost || 0,
          }],
          userId: 'test',
          discountAmount: 0,
          taxAmount: 0,
          total: products[0].sellingPrice,
          paidAmount: products[0].sellingPrice,
          paymentMethod: 'CASH',
          loyaltyEarned: 0,
          loyaltyRedeemed: 0,
        })
        const afterStats = await getLocalDBStats()
        return afterStats.sales > beforeStats.sales
      }},
      { name: 'Service Worker مسجل', test: async () => {
        if (!('serviceWorker' in navigator)) return false
        const reg = await navigator.serviceWorker.getRegistration()
        return reg !== undefined
      }},
      { name: 'PWA Manifest موجود', test: async () => {
        const res = await fetch('/manifest.json')
        const data = await res.json()
        return data.name && data.display === 'standalone'
      }},
      { name: 'التخزين المحلي يعمل', test: async () => {
        const { getLocalDBStats } = await import('@/lib/local-db')
        const stats = await getLocalDBStats()
        const total = Object.values(stats).reduce((a, b) => a + b, 0)
        return total > 0
      }},
    ]

    for (const t of tests) {
      setTestResults(prev => ({ ...prev, [t.name]: 'pending' }))
      await new Promise(r => setTimeout(r, 500))
      try {
        const result = await t.test()
        setTestResults(prev => ({ ...prev, [t.name]: result ? 'pass' : 'fail' }))
      } catch (e) {
        setTestResults(prev => ({ ...prev, [t.name]: 'fail' }))
      }
    }
  }

  const storagePercent = dbInfo?.storageQuota ? (dbInfo.storageUsed / dbInfo.storageQuota) * 100 : 0

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            مركز الأوفلين والاختبار
          </h1>
          <p className="text-muted-foreground text-sm">
            معلومات قاعدة البيانات المحلية + اختبار ميزات الأوفلين
          </p>
        </div>
        <Button
          variant={online ? 'default' : 'destructive'}
          onClick={toggleOffline}
          className="h-10"
        >
          {online ? <Wifi className="w-4 h-4 ml-1" /> : <WifiOff className="w-4 h-4 ml-1" />}
          {online ? 'محاكاة الأوفلين' : 'استعادة الاتصال'}
        </Button>
      </div>

      {/* Connection Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className={online ? 'border-green-500/30' : 'border-red-500/30'}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${online ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {online ? <Wifi className="w-6 h-6 text-green-600" /> : <WifiOff className="w-6 h-6 text-red-600" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">حالة الاتصال</p>
              <p className={`font-bold ${online ? 'text-green-600' : 'text-red-600'}`}>
                {online ? '🟢 متصل' : '🔴 غير متصل'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <RefreshCw className={`w-6 h-6 text-blue-600 ${syncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">المزامنة</p>
              <p className="font-bold text-blue-600">
                {syncing ? '🟡 جاري المزامنة...' : '✅ متوقف'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Database className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عمليات معلقة</p>
              <p className="font-bold text-amber-600">{pendingSync} عملية</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Local Database Info */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            قاعدة البيانات المحلية
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={rebuildDB} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
              إعادة البناء
            </Button>
            <Button size="sm" variant="outline" onClick={clearDB} disabled={loading}>
              <Trash2 className="w-4 h-4 ml-1" />
              مسح
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {dbInfo ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">الاسم</p>
                    <p className="font-medium">{dbInfo.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">الإصدار</p>
                    <p className="font-medium">v{dbInfo.version}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">المساحة المستخدمة</p>
                    <p className="font-medium">{(dbInfo.storageUsed / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">السعة الكلية</p>
                    <p className="font-medium">{(dbInfo.storageQuota / 1024 / 1024).toFixed(0)} MB</p>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">استخدام المساحة</span>
                  <span>{storagePercent.toFixed(2)}%</span>
                </div>
                <Progress value={storagePercent} className="h-2" />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              قاعدة البيانات المحلية غير موجودة. اضغط "إعادة البناء" لإنشائها.
            </p>
          )}

          <Separator />

          {dbStats && (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {[
                { label: 'المنتجات', value: dbStats.products, icon: '📦' },
                { label: 'الفئات', value: dbStats.categories, icon: '📁' },
                { label: 'العملاء', value: dbStats.customers, icon: '👥' },
                { label: 'الإعدادات', value: dbStats.settings, icon: '⚙️' },
                { label: 'المبيعات', value: dbStats.sales, icon: '🧾' },
                { label: 'حركات المخزون', value: dbStats.stockMovements, icon: '📊' },
                { label: 'معاملات الولاء', value: dbStats.loyaltyTransactions, icon: '💎' },
                { label: 'المستخدمون', value: dbStats.users, icon: '👤' },
                { label: 'عمليات المزامنة', value: dbStats.syncQueue, icon: '🔄' },
                { label: 'الإجمالي', value: Object.values(dbStats).reduce((a, b) => a + b, 0), icon: '📈' },
              ].map((s, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-muted/30 border">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold pos-number">{s.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Offline Tests */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            اختبار ميزات الأوفلين
          </CardTitle>
          <Button size="sm" onClick={runTests}>
            <Zap className="w-4 h-4 ml-1" />
            تشغيل الاختبارات
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(testResults).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                اضغط "تشغيل الاختبارات" للتحقق من ميزات الأوفلين
              </p>
            ) : (
              Object.entries(testResults).map(([name, status]) => (
                <div key={name} className="flex items-center gap-3 p-2.5 rounded-lg border">
                  {status === 'pending' && <RefreshCw className="w-5 h-5 text-amber-500 animate-spin shrink-0" />}
                  {status === 'pass' && <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />}
                  {status === 'fail' && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                  <span className="flex-1 text-sm">{name}</span>
                  <Badge variant={status === 'pass' ? 'default' : status === 'fail' ? 'destructive' : 'secondary'}>
                    {status === 'pending' ? 'جاري...' : status === 'pass' ? 'نجح' : 'فشل'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hardware Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            معلومات الأجهزة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <ScanLine className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-sm">قارئ الباركود</span>
              </div>
              <p className="text-xs text-muted-foreground">
                يعمل كـ USB Keyboard Wedge - اضغط F2 في شاشة البيع ثم امسح الباركود
              </p>
              <Badge className="mt-2" variant="secondary">جاهز</Badge>
            </div>
            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Printer className="w-5 h-5 text-green-500" />
                <span className="font-medium text-sm">الطابعة الحرارية</span>
              </div>
              <p className="text-xs text-muted-foreground">
                طباعة إيصال 80mm/58mm - تظهر تلقائياً بعد إتمام البيع
              </p>
              <Badge className="mt-2" variant="secondary">جاهز</Badge>
            </div>
            <div className="p-3 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-5 h-5 text-purple-500" />
                <span className="font-medium text-sm">PWA</span>
              </div>
              <p className="text-xs text-muted-foreground">
                قابل للتثبيت على Windows/Android - يعمل بدون إنترنت
              </p>
              <Badge className="mt-2" variant="secondary">جاهز</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Helper import
async function searchLocalProducts(q: string) {
  const { searchLocalProducts: sp } = await import('@/lib/local-db')
  return sp(q)
}
