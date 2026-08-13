'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { isDesktop } from '@/lib/desktop-mode'
import { useConnectionStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Settings as SettingsIcon, Store, Coins, Percent, Printer, Scan, Cpu,
  Save, RefreshCw, Users, Wifi, WifiOff, CheckCircle2, XCircle, TestTube,
  Printer as PrinterIcon, Banknote, AlertTriangle, ShieldCheck, CreditCard, Receipt,
  Cloud, Database, RefreshCw as SyncIcon,
} from 'lucide-react'
import { toast } from 'sonner'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدير',
  MANAGER: 'مشرف',
  CASHIER: 'كاشير',
  INVENTORY: 'أمين مخزن',
  ACCOUNTANT: 'محاسب',
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  MANAGER: 'bg-blue-100 text-blue-700 border-blue-200',
  CASHIER: 'bg-green-100 text-green-700 border-green-200',
  INVENTORY: 'bg-amber-100 text-amber-700 border-amber-200',
  ACCOUNTANT: 'bg-cyan-100 text-cyan-700 border-cyan-200',
}

interface SettingDef {
  key: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'switch' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
  description?: string
  min?: number
  step?: number
}

const SETTING_GROUPS: { category: string; label: string; settings: SettingDef[] }[] = [
  {
    category: 'general',
    label: 'عام',
    settings: [
      { key: 'store_name', label: 'اسم المتجر', type: 'text', placeholder: 'متجر النور' },
      { key: 'store_address', label: 'العنوان', type: 'text', placeholder: 'القاهرة، مصر' },
      { key: 'store_phone', label: 'الهاتف', type: 'text', placeholder: '+20 100 000 0000' },
      { key: 'store_email', label: 'البريد الإلكتروني', type: 'text', placeholder: 'info@store.com' },
      { key: 'currency', label: 'العملة', type: 'select', options: [
        { value: 'EGP', label: 'جنيه مصري (EGP)' },
        { value: 'SAR', label: 'ريال سعودي (SAR)' },
        { value: 'USD', label: 'دولار أمريكي (USD)' },
        { value: 'AED', label: 'درهم إماراتي (AED)' },
      ]},
      { key: 'language', label: 'اللغة', type: 'select', options: [
        { value: 'ar', label: 'العربية' },
        { value: 'en', label: 'English' },
        { value: 'both', label: 'الاثنين' },
      ]},
      { key: 'receipt_footer', label: 'تذييل الإيصال', type: 'textarea', placeholder: 'شكراً لزيارتكم' },
    ],
  },
  {
    category: 'loyalty',
    label: 'الولاء',
    settings: [
      { key: 'loyalty_enabled', label: 'تفعيل برنامج الولاء', type: 'switch', description: 'السماح للعملاء بكسب واستبدال النقاط' },
      { key: 'points_per_egp', label: 'النقاط لكل ج.م', type: 'number', placeholder: '1', min: 0, step: 0.1, description: 'كم نقطة يكسبها العميل عن كل جنيه' },
      { key: 'egp_per_point', label: 'قيمة النقطة (ج.م)', type: 'number', placeholder: '0.05', min: 0, step: 0.01, description: 'قيمة النقطة عند الاستبدال' },
      { key: 'min_redeem_points', label: 'أقل نقاط للاستبدال', type: 'number', placeholder: '100', min: 0, step: 1, description: 'الحد الأدنى للنقاط المطلوبة للاستبدال' },
    ],
  },
  {
    category: 'tax',
    label: 'الضرائب',
    settings: [
      { key: 'default_tax_rate', label: 'نسبة الضريبة الافتراضية (%)', type: 'number', placeholder: '14', min: 0, step: 0.1, description: 'النسبة المطبقة على المبيعات افتراضياً' },
      { key: 'tax_inclusive', label: 'الأسعار شاملة الضريبة', type: 'switch', description: 'إذا كانت الأسعار المعروضة شاملة الضريبة' },
      { key: 'tax_number', label: 'الرقم الضريبي', type: 'text', placeholder: '123-456-789' },
    ],
  },
  {
    category: 'receipt',
    label: 'الإيصال',
    settings: [
      { key: 'paper_width', label: 'عرض الورق', type: 'select', options: [
        { value: '58', label: '58 مم' },
        { value: '80', label: '80 مم' },
      ]},
      { key: 'show_logo', label: 'إظهار الشعار', type: 'switch' },
      { key: 'auto_print', label: 'طباعة تلقائية بعد البيع', type: 'switch' },
      { key: 'cut_paper', label: 'قص الورق بعد الطباعة', type: 'switch' },
      { key: 'open_cash_drawer', label: 'فتح درج النقدية عند الطباعة', type: 'switch' },
    ],
  },
]

export function SettingsModule() {
  const [settings, setSettings] = useState<Record<string, Record<string, string>>>({})
  const [flat, setFlat] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [syncSettings, setSyncSettings] = useState<Record<string, string>>({})
  const [testingConnection, setTestingConnection] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null)
  const [localStats, setLocalStats] = useState({ products: 0, categories: 0, customers: 0, sales: 0, pendingSync: 0, stockMovements: 0, loyaltyTransactions: 0, settings: 0, users: 0, syncQueue: 0 })
  const { online, setOnline, pendingSync, setPendingSync } = useConnectionStore()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/settings')
      setSettings(data?.grouped || {})
      setFlat(data?.flat || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadLocalStats() }, [])

  // Load sync settings from the flat settings array
  useEffect(() => {
    if (flat.length > 0) {
      const syncKeys = ['supabase.url', 'supabase.key', 'sync.enabled', 'sync.lastSync']
      const syncData: Record<string, string> = {}
      for (const s of flat) {
        if (syncKeys.includes(s.key)) syncData[s.key] = s.value
      }
      setSyncSettings(syncData)
    }
  }, [flat])

  const updateSyncSetting = (key: string, value: string) => {
    setSyncSettings(prev => ({ ...prev, [key]: value }))
  }

  const saveSyncSettings = async () => {
    setSaving('sync')
    try {
      const settingsArr = Object.entries(syncSettings).map(([key, value]) => ({ key, value }))
      await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ settings: settingsArr }) })
      toast.success('تم حفظ إعدادات المزامنة')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(null)
    }
  }

  const simulateOffline = () => {
    setOnline(false)
  }

  const simulateOnline = () => {
    setOnline(true)
    setPendingSync(0)
  }

  const refreshLocalDB = async () => {
    try {
      const { refreshLocalData } = await import('@/lib/local-db')
      await refreshLocalData()
      await loadLocalStats()
      toast.success('تم إعادة بناء قاعدة البيانات المحلية')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const clearLocalDB = async () => {
    try {
      const { clearLocalDB: clearDB } = await import('@/lib/local-db')
      await clearDB()
      await loadLocalStats()
      toast.success('تم مسح قاعدة البيانات المحلية')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const loadLocalStats = async () => {
    try {
      const { getLocalDBStats } = await import('@/lib/local-db')
      const stats = await getLocalDBStats()
      setLocalStats(stats)
    } catch (e) {
      // ignore
    }
  }

  const testConnection = async () => {
    setTestingConnection(true)
    setConnectionStatus(null)
    try {
      const { testSupabaseConnection } = await import('@/lib/sync-engine')
      const result = await testSupabaseConnection(syncSettings['supabase.url'] || '', syncSettings['supabase.key'] || '')
      setConnectionStatus(result)
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
    } catch (e: any) {
      setConnectionStatus({ success: false, message: e.message })
    } finally {
      setTestingConnection(false)
    }
  }

  const uploadToSupabase = async () => {
    setUploading(true)
    try {
      // Save settings first
      await saveSyncSettings()
      // Then export
      const { exportLocalToSupabase } = await import('@/lib/supabase')
      const result = await exportLocalToSupabase()
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
      setConnectionStatus({ success: result.success, message: result.message })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  const downloadFromSupabase = async () => {
    setDownloading(true)
    try {
      if (isDesktop()) {
        // Desktop: pull real Supabase data straight into the local SQLite db (pos.db)
        const { pullFromServer } = await import('@/lib/desktop-api')
        const { pulled } = await pullFromServer()
        toast.success(`تم تحميل ${pulled} سجل من الخادم`)
        setConnectionStatus({ success: true, message: `تم تحميل ${pulled} سجل` })
      } else {
        await saveSyncSettings()
        const { importFromSupabase } = await import('@/lib/supabase')
        const result = await importFromSupabase()
        if (result.success) toast.success(result.message)
        else toast.error(result.message)
        setConnectionStatus({ success: result.success, message: result.message })
      }
      await loadLocalStats()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDownloading(false)
    }
  }

  const syncNow = async () => {
    try {
      if (isDesktop()) {
        const { runDesktopSync } = await import('@/lib/desktop-api')
        const result = await runDesktopSync()
        toast.success(`تمت المزامنة: ${result.pushed} مرفوع، ${result.pulled} محمل`)
      } else {
        const { syncNow: doSync } = await import('@/lib/sync-engine')
        const result = await doSync()
        toast.success(`تمت المزامنة: ${result.pushed} مرفوع، ${result.pulled} محمل`)
      }
      await loadLocalStats()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      // No dedicated users endpoint; we can't fetch users - show empty state
      // Try /users endpoint first
      const data = await apiFetch('/users').catch(() => null)
      setUsers(data || [])
    } catch {
      setUsers([])
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const getValue = (category: string, key: string): string => {
    if (settings[category]?.[key] !== undefined) return settings[category][key]
    // defaults
    if (key === 'loyalty_enabled') return 'true'
    if (key === 'tax_inclusive') return 'false'
    if (key === 'show_logo') return 'true'
    if (key === 'auto_print') return 'false'
    if (key === 'cut_paper') return 'true'
    if (key === 'open_cash_drawer') return 'true'
    if (key === 'paper_width') return '80'
    if (key === 'currency') return 'EGP'
    if (key === 'language') return 'ar'
    if (key === 'points_per_egp') return '1'
    if (key === 'egp_per_point') return '0.05'
    if (key === 'min_redeem_points') return '100'
    if (key === 'default_tax_rate') return '14'
    return ''
  }

  const updateValue = (category: string, key: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [category]: { ...(prev[category] || {}), [key]: value },
    }))
  }

  const saveGroup = async (category: string) => {
    setSaving(category)
    try {
      const group = settings[category] || {}
      const payload = Object.entries(group).map(([key, value]) => ({ key, value, category }))
      // Also include any defaults that aren't set yet
      const defs = SETTING_GROUPS.find(g => g.category === category)
      if (defs) {
        for (const def of defs.settings) {
          if (!payload.find(p => p.key === def.key)) {
            payload.push({ key: def.key, value: getValue(category, def.key), category })
          }
        }
      }
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: payload }),
      })
      toast.success('تم حفظ الإعدادات')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(null)
    }
  }

  // Hardware tests (simulated)
  const testPrint = () => {
    toast.success('تم إرسال أمر الاختبار إلى الطابعة بنجاح', { description: 'تأكد من خروج ورقة الاختبار' })
  }
  const sampleReceipt = () => {
    toast.success('تم إرسال إيصال تجريبي للطباعة', { description: 'متجر النور · إجمالي: 0.00 ج.م' })
  }
  const openCashDrawer = () => {
    toast.success('تم إرسال أمر فتح درج النقدية', { description: 'يجب أن يفتح الدرج الآن' })
  }
  const testScanner = () => {
    toast.success('تم تفعيل وضع اختبار الماسح', { description: 'امسح أي باركود للاختبار' })
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-primary" />
            الإعدادات
          </h1>
          <p className="text-muted-foreground text-sm">إدارة إعدادات المتجر والنظام</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="general">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="general" className="gap-1.5"><Store className="w-4 h-4" />عام</TabsTrigger>
            <TabsTrigger value="loyalty" className="gap-1.5"><Coins className="w-4 h-4" />الولاء</TabsTrigger>
            <TabsTrigger value="tax" className="gap-1.5"><Percent className="w-4 h-4" />الضرائب</TabsTrigger>
            <TabsTrigger value="receipt" className="gap-1.5"><Printer className="w-4 h-4" />الإيصال</TabsTrigger>
            <TabsTrigger value="hardware" className="gap-1.5"><Cpu className="w-4 h-4" />الأجهزة</TabsTrigger>
            <TabsTrigger value="sync" className="gap-1.5" onClick={loadLocalStats}><Cloud className="w-4 h-4" />المزامنة</TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5"><Users className="w-4 h-4" />المستخدمون</TabsTrigger>
          </TabsList>

          {/* General / Loyalty / Tax / Receipt - all use the dynamic form */}
          {SETTING_GROUPS.map((group) => (
            <TabsContent key={group.category} value={group.category}>
              <Card>
                <CardHeader className="pb-3 flex-row items-center justify-between">
                  <CardTitle className="text-base">{group.label}</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => saveGroup(group.category)}
                    disabled={saving === group.category}
                  >
                    <Save className="w-4 h-4 ml-1" />
                    {saving === group.category ? 'جاري الحفظ...' : 'حفظ'}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {group.settings.map((def) => (
                      <SettingField
                        key={def.key}
                        def={def}
                        value={getValue(group.category, def.key)}
                        onChange={(v) => updateValue(group.category, def.key, v)}
                      />
                    ))}
                  </div>
                  {group.settings.length % 2 !== 0 && <div className="hidden md:block" />}
                </CardContent>
              </Card>
            </TabsContent>
          ))}

          {/* Hardware Tab */}
          <TabsContent value="hardware">
            <div className="space-y-4">
              {/* Offline simulation */}
              <Card className={online ? '' : 'border-amber-300 bg-amber-50/30'}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {online ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-amber-600" />}
                    الاتصال بالخادم
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium mb-1">
                        {online ? 'متصل' : 'غير متصل (وضع الاختبار)'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {online
                          ? 'النظام يعمل بشكل طبيعي'
                          : 'النظام يعمل في وضع عدم الاتصال - للتجربة فقط'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={online ? 'outline' : 'default'} className={online ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-500'}>
                        {online ? 'ONLINE' : 'OFFLINE'}
                      </Badge>
                      <Switch
                        checked={!online}
                        onCheckedChange={(checked) => {
                          setOnline(!checked)
                          toast.info(checked ? 'تم تفعيل وضع عدم الاتصال' : 'تم استعادة الاتصال')
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Printer */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <PrinterIcon className="w-4 h-4 text-blue-600" />
                      الطابعة الحرارية
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">الحالة</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="w-3 h-3 ml-1" />
                        متصلة
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={testPrint}>
                        <TestTube className="w-4 h-4 ml-1" />
                        طباعة اختبار
                      </Button>
                      <Button variant="outline" size="sm" onClick={sampleReceipt}>
                        <Receipt className="w-4 h-4 ml-1" />
                        إيصال تجريبي
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Barcode Scanner */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Scan className="w-4 h-4 text-purple-600" />
                      ماسح الباركود
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">الحالة</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="w-3 h-3 ml-1" />
                        متصل
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={testScanner}>
                      <TestTube className="w-4 h-4 ml-1" />
                      اختبار الماسح
                    </Button>
                  </CardContent>
                </Card>

                {/* Cash Drawer */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-amber-600" />
                      درج النقدية
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">الحالة</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="w-3 h-3 ml-1" />
                        متصل
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={openCashDrawer}>
                      <Banknote className="w-4 h-4 ml-1" />
                      اختبار فتح الدرج
                    </Button>
                  </CardContent>
                </Card>

                {/* Payment Terminal */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-teal-600" />
                      وحدة الدفع
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">الحالة</span>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        <XCircle className="w-3 h-3 ml-1" />
                        غير متصل
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" disabled>
                      <TestTube className="w-4 h-4 ml-1" />
                      اختبار الاتصال
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-amber-200 bg-amber-50/30">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium mb-1">ملاحظة حول الأجهزة</p>
                    <p className="text-xs text-muted-foreground">
                      اختبارات الأجهزة في هذا الإصدار محاكاة فقط. لتشغيل الأجهزة الفعلية (USB/Serial)، تأكد من تثبيت تعريفات الأجهزة وربطها بمحرك الطباعة المحلي.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Sync Tab - Supabase & Offline */}
          <TabsContent value="sync">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3 flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-primary" />
                    مزامنة Supabase (الأونلاين)
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={saveSyncSettings}
                    disabled={saving === 'sync'}
                  >
                    <Save className="w-4 h-4 ml-1" />
                    {saving === 'sync' ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-500/10 p-3 rounded-lg flex gap-2">
                    <Cloud className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">تخزين البيانات أونلاين</p>
                      <p className="text-muted-foreground mt-1">
                        يتم مزامنة البيانات مع Supabase تلقائياً عند توفر الإنترنت. البيانات الأوفلين تُحفظ محلياً في المتصفح (IndexedDB) وتُزامن عند عودة الاتصال.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Supabase URL</Label>
                      <Input
                        placeholder="https://xxxxx.supabase.co"
                        value={syncSettings['supabase.url'] || ''}
                        onChange={(e) => updateSyncSetting('supabase.url', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">رابط مشروع Supabase الخاص بك</p>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Supabase Anon Key</Label>
                      <Input
                        type="password"
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        value={syncSettings['supabase.key'] || ''}
                        onChange={(e) => updateSyncSetting('supabase.key', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">مفتاح الوصول العام (Anon Key)</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <Label className="cursor-pointer">تفعيل المزامنة التلقائية</Label>
                      <p className="text-xs text-muted-foreground mt-1">مزامنة البيانات تلقائياً عند توفر الإنترنت</p>
                    </div>
                    <Switch
                      checked={syncSettings['sync.enabled'] === 'true'}
                      onCheckedChange={(v) => updateSyncSetting('sync.enabled', v ? 'true' : 'false')}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">حالة الاتصال</p>
                      <div className="flex items-center gap-2">
                        {online ? (
                          <><Wifi className="w-4 h-4 text-green-500" /><span className="text-sm font-medium text-green-600">متصل</span></>
                        ) : (
                          <><WifiOff className="w-4 h-4 text-red-500" /><span className="text-sm font-medium text-red-600">غير متصل</span></>
                        )}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">عمليات معلقة</p>
                      <p className="text-sm font-bold pos-number">{pendingSync} عملية بانتظار المزامنة</p>
                    </div>
                  </div>

                  {/* Supabase test & sync buttons */}
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={testConnection}
                        disabled={testingConnection || !syncSettings['supabase.url']}
                      >
                        <TestTube className="w-4 h-4 ml-1" />
                        {testingConnection ? 'جاري الاختبار...' : 'اختبار الاتصال'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={uploadToSupabase}
                        disabled={uploading || !syncSettings['supabase.url']}
                      >
                        <Cloud className="w-4 h-4 ml-1" />
                        {uploading ? 'جاري الرفع...' : 'رفع البيانات للسحابة'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadFromSupabase}
                        disabled={downloading || !syncSettings['supabase.url']}
                      >
                        <Database className="w-4 h-4 ml-1" />
                        {downloading ? 'جاري التحميل...' : 'تحميل من السحابة'}
                      </Button>
                    </div>
                    {connectionStatus && (
                      <div className={`p-2 rounded-lg text-sm flex items-center gap-2 ${
                        connectionStatus.success ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'
                      }`}>
                        {connectionStatus.success
                          ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                          : <XCircle className="w-4 h-4 shrink-0" />}
                        <span>{connectionStatus.message}</span>
                      </div>
                    )}
                  </div>

                  {/* SQL Schema instructions */}
                  <div className="bg-amber-500/10 p-3 rounded-lg">
                    <p className="text-sm font-medium text-amber-700 mb-1">📋 إعداد Supabase لأول مرة</p>
                    <p className="text-xs text-muted-foreground">
                      1. أنشئ مشروع جديد على <a href="https://supabase.com" target="_blank" rel="noopener" className="text-primary underline">supabase.com</a><br/>
                      2. اذهب إلى SQL Editor وانسخ محتوى ملف <code className="bg-muted px-1 rounded">supabase-schema.sql</code><br/>
                      3. الصق SQL ونفذه لإنشاء الجداول<br/>
                      4. انسخ Project URL و Anon Key من Settings → API<br/>
                      5. أدخلهما هنا واضغط "اختبار الاتصال"
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { simulateOffline(); toast.success('تم تفعيل وضع الأوفلين') }}>
                      <WifiOff className="w-4 h-4 ml-1" />
                      محاكاة الأوفلين
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { simulateOnline(); toast.success('تم استعادة الاتصال') }}>
                      <Wifi className="w-4 h-4 ml-1" />
                      استعادة الاتصال
                    </Button>
                    <Button variant="outline" size="sm" onClick={syncNow}>
                      <RefreshCw className="w-4 h-4 ml-1" />
                      مزامنة الآن
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" />
                    قاعدة البيانات المحلية (الأوفلين)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-amber-500/10 p-3 rounded-lg flex gap-2">
                    <Database className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">التخزين المحلي القوي (IndexedDB / Dexie)</p>
                      <p className="text-muted-foreground mt-1">
                        عند أول تثبيت، يُبنى قاعدة بيانات محلية كاملة بكل المنتجات والعملاء والفئات.
                        عمليات البيع تعمل بدون إنترنت وتُحفظ محلياً ثم تُزامن مع Supabase عند عودة الاتصال.
                      </p>
                    </div>
                  </div>

                  {/* Local DB statistics */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">منتجات</p>
                      <p className="text-xl font-bold pos-number">{localStats.products}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">عملاء</p>
                      <p className="text-xl font-bold pos-number">{localStats.customers}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">فواتير محفوظة</p>
                      <p className="text-xl font-bold pos-number">{localStats.sales}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={refreshLocalDB} className="flex-1">
                      <RefreshCw className="w-4 h-4 ml-1" />
                      إعادة بناء القاعدة المحلية
                    </Button>
                    <Button variant="outline" size="sm" onClick={clearLocalDB}>
                      <XCircle className="w-4 h-4 ml-1" />
                      مسح
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  مستخدمو النظام
                </CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : users.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {users.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate" dir="ltr">@{u.username}</p>
                        </div>
                        <Badge variant="outline" className={`text-xs ${ROLE_COLORS[u.role] || ''}`}>
                          <ShieldCheck className="w-3 h-3 ml-1" />
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">لا يمكن عرض المستخدمين حالياً</p>
                    <p className="text-xs text-muted-foreground">
                      لإدارة المستخدمين، استخدم لوحة تحكم المسؤول. {flat.length > 0 && `(${flat.length} إعداد محمول)`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function SettingField({ def, value, onChange }: { def: SettingDef; value: string; onChange: (v: string) => void }) {
  return (
    <div className={`space-y-2 ${def.type === 'textarea' ? 'md:col-span-2' : ''}`}>
      <Label htmlFor={def.key} className="text-sm">{def.label}</Label>
      {def.type === 'text' && (
        <Input
          id={def.key}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          dir={def.key.includes('email') || def.key.includes('phone') ? 'ltr' : undefined}
        />
      )}
      {def.type === 'number' && (
        <Input
          id={def.key}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          min={def.min}
          step={def.step}
          dir="ltr"
        />
      )}
      {def.type === 'textarea' && (
        <Textarea
          id={def.key}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
        />
      )}
      {def.type === 'switch' && (
        <div className="flex items-center gap-3 pt-1">
          <Switch
            id={def.key}
            checked={value === 'true'}
            onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
          />
          <span className="text-sm text-muted-foreground">
            {value === 'true' ? 'مفعّل' : 'معطّل'}
          </span>
        </div>
      )}
      {def.type === 'select' && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={def.key}><SelectValue placeholder={def.placeholder} /></SelectTrigger>
          <SelectContent>
            {def.options?.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {def.description && (
        <p className="text-xs text-muted-foreground">{def.description}</p>
      )}
    </div>
  )
}


