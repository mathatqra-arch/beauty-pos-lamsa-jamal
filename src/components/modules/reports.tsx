'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { apiFetch, formatEGP, formatNumber, formatDateTime, formatDate } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  BarChart3, Download, FileText, TrendingUp, Wallet, Package, Users,
  Truck, ShoppingCart, RotateCcw, Coins, Receipt, Percent, RefreshCw, Filter,
} from 'lucide-react'
import { toast } from 'sonner'

type ReportType =
  | 'sales' | 'profit' | 'inventory' | 'product' | 'customer'
  | 'supplier' | 'purchases' | 'returns' | 'cash' | 'expense' | 'loyalty' | 'tax'

const REPORT_TYPES: { value: ReportType; label: string; icon: any; needsDate?: boolean }[] = [
  { value: 'sales',      label: 'المبيعات',   icon: ShoppingCart, needsDate: true },
  { value: 'profit',     label: 'الأرباح',    icon: TrendingUp,   needsDate: true },
  { value: 'inventory',  label: 'المخزون',    icon: Package },
  { value: 'product',    label: 'المنتجات',   icon: BarChart3,    needsDate: true },
  { value: 'customer',   label: 'العملاء',    icon: Users,        needsDate: true },
  { value: 'supplier',   label: 'الموردون',   icon: Truck,        needsDate: true },
  { value: 'cash',       label: 'الخزنة',     icon: Wallet,       needsDate: true },
  { value: 'expense',    label: 'المصروفات',  icon: Receipt,      needsDate: true },
  { value: 'loyalty',    label: 'الولاء',     icon: Coins },
  { value: 'tax',        label: 'الضرائب',    icon: Percent,      needsDate: true },
]

// Map UI tab to API type
const API_TYPE_MAP: Record<string, string> = {
  sales: 'sales',
  profit: 'profit',
  inventory: 'inventory',
  product: 'product',
  customer: 'customer',
  supplier: 'supplier',
  purchases: 'supplier', // purchases uses supplier endpoint
  returns: 'sales',      // returns - we'll re-use sales; simplified
  cash: 'cash',
  expense: 'expense',
  loyalty: 'loyalty',
  tax: 'tax',
}

const STOCK_STATUS: Record<string, { label: string; color: string }> = {
  IN_STOCK:     { label: 'متوفر',   color: 'bg-green-100 text-green-700 border-green-200' },
  LOW_STOCK:    { label: 'منخفض',   color: 'bg-amber-100 text-amber-700 border-amber-200' },
  OUT_OF_STOCK: { label: 'نفد',     color: 'bg-red-100 text-red-700 border-red-200' },
}

const PAYMENT_BADGE: Record<string, string> = {
  CASH: 'bg-green-100 text-green-700 border-green-200',
  CARD: 'bg-blue-100 text-blue-700 border-blue-200',
  TRANSFER: 'bg-purple-100 text-purple-700 border-purple-200',
  CREDIT: 'bg-amber-100 text-amber-700 border-amber-200',
}

const SESSION_STATUS: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-700 border-green-200',
  CLOSED: 'bg-gray-100 text-gray-700 border-gray-200',
}

function fmtNum(v: number | undefined | null): string {
  return formatNumber(v || 0)
}
function fmtEGP(v: number | undefined | null): string {
  return formatEGP(v || 0)
}

function safeParse(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  return String(v)
}

export function ReportsModule() {
  const [reportType, setReportType] = useState<ReportType>('sales')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [groupBy, setGroupBy] = useState('none')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('type', API_TYPE_MAP[reportType] || reportType)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo + 'T23:59:59')
      if (groupBy && groupBy !== 'none') params.set('groupBy', groupBy)
      const result = await apiFetch(`/reports?${params.toString()}`)
      setData(result)
      setGeneratedAt(new Date().toISOString())
    } catch (e: any) {
      setError(e.message || 'فشل تحميل التقرير')
      toast.error(e.message || 'فشل تحميل التقرير')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [reportType, dateFrom, dateTo, groupBy])

  useEffect(() => { generate() }, [generate])

  const setQuickRange = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    setDateFrom(start.toISOString().slice(0, 10))
    setDateTo(end.toISOString().slice(0, 10))
  }

  const setThisMonth = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    setDateFrom(start.toISOString().slice(0, 10))
    setDateTo(now.toISOString().slice(0, 10))
  }

  const setLastMonth = () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    setDateFrom(start.toISOString().slice(0, 10))
    setDateTo(end.toISOString().slice(0, 10))
  }

  const meta = REPORT_TYPES.find(r => r.value === reportType)!

  // CSV Export
  const exportCSV = () => {
    if (!data) return
    let headers: string[] = []
    let rows: any[] = []

    switch (reportType) {
      case 'sales':
        headers = ['رقم الفاتورة', 'التاريخ', 'العميل', 'الكاشير', 'الإجمالي', 'المدفوع', 'طريقة الدفع']
        rows = (data.sales || []).map((s: any) => [
          s.invoiceNumber, formatDate(s.createdAt), s.customer?.name || '—', s.user?.name || '—',
          s.total, s.paidAmount, s.paymentMethod,
        ])
        break
      case 'profit':
        if (groupBy === 'product' && data.byProduct) {
          headers = ['المنتج', 'SKU', 'الوحدات', 'الإيراد', 'التكلفة', 'الربح']
          rows = data.byProduct.map((p: any) => [p.nameAr || p.name, p.sku, p.units, p.revenue, p.cost, p.profit])
        } else {
          headers = ['المنتج', 'الكمية', 'الإيراد', 'التكلفة', 'الربح']
          rows = (data.items || []).map((it: any) => [it.product?.nameAr || it.product?.name || '—', it.quantity, it.total, it.costAtSale * it.quantity, it.total - it.costAtSale * it.quantity])
        }
        break
      case 'inventory':
        headers = ['المنتج', 'SKU', 'الفئة', 'المخزون', 'التكلفة', 'القيمة', 'السعر', 'الحالة']
        rows = (data.products || []).map((p: any) => [p.nameAr || p.name, p.sku, p.category?.name || '—', p.stock, p.avgCost, p.stockValue, p.sellingPrice, p.status])
        break
      case 'product':
        headers = ['المنتج', 'SKU', 'الوحدات', 'الإيراد', 'التكلفة', 'الربح']
        rows = (data.products || []).map((r: any) => [r.product?.nameAr || r.product?.name, r.product?.sku, r.units, r.revenue, r.cost, r.profit])
        break
      case 'customer':
        headers = ['العميل', 'الهاتف', 'الفئة', 'الطلبات', 'الإجمالي']
        rows = (data.customers || []).map((r: any) => [r.customer?.name, r.customer?.phone || '—', r.customer?.tier || '—', r.orders, r.total])
        break
      case 'supplier':
        headers = ['المورد', 'الهاتف', 'المشتريات', 'الإجمالي', 'المدفوع', 'المستحق']
        rows = (data.suppliers || []).map((r: any) => [r.supplier?.name, r.supplier?.phone || '—', r.purchases, r.total, r.paid, r.balance])
        break
      case 'cash':
        headers = ['المستخدم', 'افتتاح', 'إغلاق', 'متوقع', 'الفرق', 'الحالة', 'الافتتاح (وقت)']
        rows = (data.sessions || []).map((s: any) => [s.user?.name, s.openingBalance, s.closingBalance || 0, s.expectedCash || 0, s.difference || 0, s.status, formatDateTime(s.openedAt)])
        break
      case 'expense':
        headers = ['الفئة', 'المبلغ', 'طريقة الدفع', 'المستخدم', 'التاريخ']
        rows = (data.expenses || []).map((e: any) => [e.category?.nameAr || e.category?.name || '—', e.amount, e.paymentMethod, e.user?.name || '—', formatDate(e.date)])
        break
      case 'loyalty':
        headers = ['العميل', 'الفئة', 'النقاط', 'المكتسبة', 'المستبدلة']
        rows = (data.accounts || []).map((a: any) => [a.customer?.name, a.tier, a.points, a.totalEarned, a.totalRedeemed])
        break
      case 'tax':
        headers = ['رقم الفاتورة', 'التاريخ', 'الصافي', 'الضريبة', 'الإجمالي']
        rows = (data.sales || []).map((s: any) => [s.invoiceNumber, formatDate(s.createdAt), s.subtotal, s.taxAmount, s.total])
        break
      default:
        return
    }

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map((cell: any) => {
        const s = safeParse(cell)
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
      }).join(','))
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير التقرير')
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            التقارير
          </h1>
          <p className="text-muted-foreground text-sm">تقارير شاملة عن أداء المتجر</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
          <Button size="sm" onClick={exportCSV} disabled={!data || loading}>
            <Download className="w-4 h-4 ml-1" />
            تصدير CSV
          </Button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <Card>
        <CardContent className="p-3">
          <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent">
              {REPORT_TYPES.map(rt => {
                const Icon = rt.icon
                return (
                  <TabsTrigger
                    key={rt.value}
                    value={rt.value}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {rt.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              الفلاتر:
            </div>
            {meta.needsDate && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">من تاريخ</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">إلى تاريخ</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setQuickRange(7)}>7 أيام</Button>
                  <Button variant="outline" size="sm" onClick={() => setQuickRange(30)}>30 يوم</Button>
                  <Button variant="outline" size="sm" onClick={setThisMonth}>هذا الشهر</Button>
                  <Button variant="outline" size="sm" onClick={setLastMonth}>الشهر الماضي</Button>
                </div>
              </>
            )}
            {(reportType === 'sales' || reportType === 'expense' || reportType === 'profit') && (
              <div className="space-y-1">
                <Label className="text-xs">تجميع حسب</Label>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="بدون" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون تجميع</SelectItem>
                    {reportType === 'sales' && <>
                      <SelectItem value="day">يومي</SelectItem>
                      <SelectItem value="week">أسبوعي</SelectItem>
                      <SelectItem value="month">شهري</SelectItem>
                    </>}
                    {reportType === 'profit' && <SelectItem value="product">منتج</SelectItem>}
                    {reportType === 'expense' && <SelectItem value="category">فئة</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={generate} disabled={loading}>
              <FileText className="w-4 h-4 ml-1" />
              {loading ? 'جاري التوليد...' : 'توليد التقرير'}
            </Button>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setGroupBy('') }}>
                مسح الفلاتر
              </Button>
            )}
          </div>
          {generatedAt && (
            <p className="text-xs text-muted-foreground mt-3">
              آخر تحديث: {formatDateTime(generatedAt)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={generate}>
              <RefreshCw className="w-4 h-4 ml-1" />
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      ) : data ? (
        <ReportContent type={reportType} data={data} />
      ) : null}
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-primary', bg = 'bg-primary/10' }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        {Icon && (
          <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-2`}>
            <Icon className={`w-4.5 h-4.5 ${color}`} />
          </div>
        )}
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-lg font-bold pos-number">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function ReportContent({ type, data }: { type: ReportType; data: any }) {
  switch (type) {
    case 'sales': return <SalesReport data={data} />
    case 'profit': return <ProfitReport data={data} />
    case 'inventory': return <InventoryReport data={data} />
    case 'product': return <ProductReport data={data} />
    case 'customer': return <CustomerReport data={data} />
    case 'supplier': return <SupplierReport data={data} />
    case 'cash': return <CashReport data={data} />
    case 'expense': return <ExpenseReport data={data} />
    case 'loyalty': return <LoyaltyReport data={data} />
    case 'tax': return <TaxReport data={data} />
    default: return null
  }
}

const EmptyReport = ({ msg = 'لا توجد بيانات' }: { msg?: string }) => (
  <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">{msg}</CardContent></Card>
)

function SalesReport({ data }: any) {
  const s = data.summary || {}
  if (data.grouped && data.grouped.length) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="عدد الفواتير" value={fmtNum(s.count)} icon={ShoppingCart} color="text-blue-600" bg="bg-blue-500/10" />
          <StatCard label="صافي المبيعات" value={fmtEGP(s.totalSubtotal)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
          <StatCard label="الضريبة" value={fmtEGP(s.totalTax)} icon={Percent} color="text-amber-600" bg="bg-amber-500/10" />
          <StatCard label="الإجمالي" value={fmtEGP(s.total)} icon={Wallet} color="text-purple-600" bg="bg-purple-500/10" />
        </div>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">المبيعات المجمعة</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[480px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>الفترة</TableHead>
                    <TableHead className="text-left">عدد الفواتير</TableHead>
                    <TableHead className="text-left">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.grouped.map((g: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{g.key}</TableCell>
                      <TableCell className="text-left pos-number">{fmtNum(g.count)}</TableCell>
                      <TableCell className="text-left font-bold pos-number">{fmtEGP(g.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data.sales?.length) return <EmptyReport msg="لا توجد مبيعات في هذه الفترة" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد الفواتير" value={fmtNum(s.count)} icon={ShoppingCart} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="صافي المبيعات" value={fmtEGP(s.totalSubtotal)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="الخصومات" value={fmtEGP(s.totalDiscount)} icon={Receipt} color="text-red-600" bg="bg-red-500/10" />
        <StatCard label="الضريبة" value={fmtEGP(s.totalTax)} icon={Percent} color="text-amber-600" bg="bg-amber-500/10" />
        <StatCard label="الإجمالي" value={fmtEGP(s.total)} icon={Wallet} color="text-purple-600" bg="bg-purple-500/10" />
        <StatCard label="المدفوع" value={fmtEGP(s.totalPaid)} icon={Coins} color="text-teal-600" bg="bg-teal-500/10" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">تفاصيل المبيعات</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>الكاشير</TableHead>
                  <TableHead className="text-left">الصافي</TableHead>
                  <TableHead className="text-left">الضريبة</TableHead>
                  <TableHead className="text-left">الإجمالي</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead className="text-left">المدفوع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sales.map((sale: any) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-xs">{sale.invoiceNumber}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(sale.createdAt)}</TableCell>
                    <TableCell className="text-sm">{sale.customer?.name || '—'}</TableCell>
                    <TableCell className="text-sm">{sale.user?.name || '—'}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(sale.subtotal)}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(sale.taxAmount)}</TableCell>
                    <TableCell className="text-left font-bold pos-number">{fmtEGP(sale.total)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${PAYMENT_BADGE[sale.paymentMethod] || ''}`}>
                        {sale.paymentMethod}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(sale.paidAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfitReport({ data }: any) {
  const s = data.summary || {}
  if (data.byProduct && data.byProduct.length) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="الإيراد" value={fmtEGP(s.revenue)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
          <StatCard label="التكلفة" value={fmtEGP(s.cost)} icon={Receipt} color="text-red-600" bg="bg-red-500/10" />
          <StatCard label="الربح الإجمالي" value={fmtEGP(s.grossProfit)} icon={Wallet} color="text-blue-600" bg="bg-blue-500/10" />
          <StatCard label="هامش الربح" value={`${s.marginPercent || 0}%`} icon={Percent} color="text-purple-600" bg="bg-purple-500/10" />
        </div>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">الأرباح حسب المنتج</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[480px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-left">الوحدات</TableHead>
                    <TableHead className="text-left">الإيراد</TableHead>
                    <TableHead className="text-left">التكلفة</TableHead>
                    <TableHead className="text-left">الربح</TableHead>
                    <TableHead className="text-left">الهامش</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byProduct.map((p: any, i: number) => {
                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.nameAr || p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                        <TableCell className="text-left pos-number">{fmtNum(p.units)}</TableCell>
                        <TableCell className="text-left pos-number">{fmtEGP(p.revenue)}</TableCell>
                        <TableCell className="text-left pos-number text-red-600">{fmtEGP(p.cost)}</TableCell>
                        <TableCell className="text-left font-bold pos-number text-green-600">{fmtEGP(p.profit)}</TableCell>
                        <TableCell className="text-left pos-number">{margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data.items?.length) return <EmptyReport msg="لا توجد بيانات أرباح" />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="الإيراد" value={fmtEGP(s.revenue)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="التكلفة" value={fmtEGP(s.cost)} icon={Receipt} color="text-red-600" bg="bg-red-500/10" />
        <StatCard label="الربح الإجمالي" value={fmtEGP(s.grossProfit)} icon={Wallet} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="هامش الربح" value={`${s.marginPercent || 0}%`} icon={Percent} color="text-purple-600" bg="bg-purple-500/10" />
        <StatCard label="عدد الأصناف" value={fmtNum(s.itemCount)} icon={Package} color="text-amber-600" bg="bg-amber-500/10" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">تفاصيل الأرباح</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead className="text-left">الكمية</TableHead>
                  <TableHead className="text-left">سعر البيع</TableHead>
                  <TableHead className="text-left">الإيراد</TableHead>
                  <TableHead className="text-left">التكلفة</TableHead>
                  <TableHead className="text-left">الربح</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((it: any, i: number) => {
                  const cost = it.costAtSale * it.quantity
                  const profit = it.total - cost
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{it.product?.nameAr || it.product?.name || '—'}</TableCell>
                      <TableCell className="text-left pos-number">{fmtNum(it.quantity)}</TableCell>
                      <TableCell className="text-left pos-number">{fmtEGP(it.unitPrice)}</TableCell>
                      <TableCell className="text-left pos-number">{fmtEGP(it.total)}</TableCell>
                      <TableCell className="text-left pos-number text-red-600">{fmtEGP(cost)}</TableCell>
                      <TableCell className="text-left font-bold pos-number text-green-600">{fmtEGP(profit)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function InventoryReport({ data }: any) {
  const s = data.summary || {}
  if (!data.products?.length) return <EmptyReport msg="لا توجد منتجات" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد المنتجات" value={fmtNum(s.totalProducts)} icon={Package} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="إجمالي الوحدات" value={fmtNum(s.totalUnits)} icon={BarChart3} color="text-cyan-600" bg="bg-cyan-500/10" />
        <StatCard label="قيمة المخزون" value={fmtEGP(s.totalStockValue)} icon={Wallet} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="الإيراد المحتمل" value={fmtEGP(s.totalPotentialRevenue)} icon={TrendingUp} color="text-purple-600" bg="bg-purple-500/10" />
        <StatCard label="نفد من المخزون" value={fmtNum(s.outOfStock)} icon={Receipt} color="text-red-600" bg="bg-red-500/10" />
        <StatCard label="مخزون منخفض" value={fmtNum(s.lowStock)} icon={Percent} color="text-amber-600" bg="bg-amber-500/10" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">المخزون الحالي</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>المنتج</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead className="text-left">المخزون</TableHead>
                  <TableHead className="text-left">التكلفة</TableHead>
                  <TableHead className="text-left">القيمة</TableHead>
                  <TableHead className="text-left">السعر</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p: any) => {
                  const st = STOCK_STATUS[p.status] || STOCK_STATUS.IN_STOCK
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nameAr || p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.category?.name || '—'}</TableCell>
                      <TableCell className="text-left pos-number font-bold">{fmtNum(p.stock)}</TableCell>
                      <TableCell className="text-left pos-number">{fmtEGP(p.avgCost)}</TableCell>
                      <TableCell className="text-left pos-number">{fmtEGP(p.stockValue)}</TableCell>
                      <TableCell className="text-left pos-number">{fmtEGP(p.sellingPrice)}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-xs ${st.color}`}>{st.label}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function ProductReport({ data }: any) {
  const s = data.summary || {}
  if (!data.products?.length) return <EmptyReport msg="لا توجد مبيعات منتجات" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد المنتجات" value={fmtNum(s.productCount)} icon={Package} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="إجمالي الوحدات" value={fmtNum(s.totalUnits)} icon={BarChart3} color="text-cyan-600" bg="bg-cyan-500/10" />
        <StatCard label="إجمالي الإيراد" value={fmtEGP(s.totalRevenue)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="إجمالي الربح" value={fmtEGP(s.totalProfit)} icon={Wallet} color="text-purple-600" bg="bg-purple-500/10" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">أداء المنتجات</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>المنتج</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-left">الوحدات</TableHead>
                  <TableHead className="text-left">الإيراد</TableHead>
                  <TableHead className="text-left">التكلفة</TableHead>
                  <TableHead className="text-left">الربح</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.product?.nameAr || r.product?.name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.product?.sku}</TableCell>
                    <TableCell className="text-left pos-number font-bold">{fmtNum(r.units)}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(r.revenue)}</TableCell>
                    <TableCell className="text-left pos-number text-red-600">{fmtEGP(r.cost)}</TableCell>
                    <TableCell className="text-left font-bold pos-number text-green-600">{fmtEGP(r.profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function CustomerReport({ data }: any) {
  const s = data.summary || {}
  if (!data.customers?.length) return <EmptyReport msg="لا توجد بيانات عملاء" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد العملاء" value={fmtNum(s.customerCount)} icon={Users} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="إجمالي الطلبات" value={fmtNum(s.totalOrders)} icon={ShoppingCart} color="text-cyan-600" bg="bg-cyan-500/10" />
        <StatCard label="إجمالي الإيراد" value={fmtEGP(s.totalRevenue)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="متوسط الطلب" value={fmtEGP(s.avgOrderValue)} icon={Wallet} color="text-purple-600" bg="bg-purple-500/10" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">أفضل العملاء</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead className="text-left">الطلبات</TableHead>
                  <TableHead className="text-left">الإجمالي</TableHead>
                  <TableHead className="text-left">متوسط الطلب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.customer?.name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" dir="ltr">{r.customer?.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{r.customer?.tier || '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-left pos-number">{fmtNum(r.orders)}</TableCell>
                    <TableCell className="text-left font-bold pos-number">{fmtEGP(r.total)}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(r.orders > 0 ? r.total / r.orders : 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function SupplierReport({ data }: any) {
  const s = data.summary || {}
  if (!data.suppliers?.length) return <EmptyReport msg="لا توجد مشتريات" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد الموردين" value={fmtNum(s.supplierCount)} icon={Truck} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="إجمالي المشتريات" value={fmtEGP(s.totalPurchases)} icon={ShoppingCart} color="text-cyan-600" bg="bg-cyan-500/10" />
        <StatCard label="المدفوع" value={fmtEGP(s.totalPaid)} icon={Wallet} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="المستحق" value={fmtEGP(s.totalBalance)} icon={Receipt} color="text-red-600" bg="bg-red-500/10" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">الموردين</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead className="text-left">عدد الفواتير</TableHead>
                  <TableHead className="text-left">الإجمالي</TableHead>
                  <TableHead className="text-left">المدفوع</TableHead>
                  <TableHead className="text-left">المستحق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.suppliers.map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.supplier?.name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" dir="ltr">{r.supplier?.phone || '—'}</TableCell>
                    <TableCell className="text-left pos-number">{fmtNum(r.purchases)}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(r.total)}</TableCell>
                    <TableCell className="text-left pos-number text-green-600">{fmtEGP(r.paid)}</TableCell>
                    <TableCell className={`text-left font-bold pos-number ${r.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmtEGP(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function CashReport({ data }: any) {
  const s = data.summary || {}
  if (!data.sessions?.length) return <EmptyReport msg="لا توجد جلسات كاش" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد الجلسات" value={fmtNum(s.sessionCount)} icon={Wallet} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="إجمالي الافتتاح" value={fmtEGP(s.totalOpening)} icon={Coins} color="text-cyan-600" bg="bg-cyan-500/10" />
        <StatCard label="إجمالي الإغلاق" value={fmtEGP(s.totalClosing)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="إجمالي الفروقات" value={fmtEGP(s.totalDifference)} icon={Percent} color={s.totalDifference < 0 ? 'text-red-600' : 'text-amber-600'} bg={s.totalDifference < 0 ? 'bg-red-500/10' : 'bg-amber-500/10'} />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">جلسات الكاش</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>المستخدم</TableHead>
                  <TableHead className="text-left">افتتاح</TableHead>
                  <TableHead className="text-left">إيداعات</TableHead>
                  <TableHead className="text-left">مصاريف</TableHead>
                  <TableHead className="text-left">متوقع</TableHead>
                  <TableHead className="text-left">فعلي</TableHead>
                  <TableHead className="text-left">الفرق</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الافتتاح</TableHead>
                  <TableHead>الإغلاق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sessions.map((sess: any) => (
                  <TableRow key={sess.id}>
                    <TableCell className="text-sm font-medium">{sess.user?.name || '—'}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(sess.openingBalance)}</TableCell>
                    <TableCell className="text-left pos-number text-green-600">{fmtEGP(sess.totalIn)}</TableCell>
                    <TableCell className="text-left pos-number text-red-600">{fmtEGP(sess.totalOut)}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(sess.expectedCash)}</TableCell>
                    <TableCell className="text-left pos-number">{fmtEGP(sess.closingBalance)}</TableCell>
                    <TableCell className={`text-left font-bold pos-number ${(sess.difference || 0) < 0 ? 'text-red-600' : (sess.difference || 0) > 0 ? 'text-blue-600' : ''}`}>
                      {fmtEGP(sess.difference)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${SESSION_STATUS[sess.status] || ''}`}>{sess.status === 'OPEN' ? 'مفتوحة' : 'مغلقة'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(sess.openedAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{sess.closedAt ? formatDateTime(sess.closedAt) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function ExpenseReport({ data }: any) {
  const s = data.summary || {}
  if (!data.expenses?.length && !data.byCategory?.length) return <EmptyReport msg="لا توجد مصروفات" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد المصروفات" value={fmtNum(s.count)} icon={Receipt} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="الإجمالي" value={fmtEGP(s.total)} icon={Wallet} color="text-red-600" bg="bg-red-500/10" />
        <StatCard label="نقدي" value={fmtEGP(s.byMethod?.CASH || 0)} icon={Coins} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="بطاقة" value={fmtEGP(s.byMethod?.CARD || 0)} icon={Percent} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="تحويل" value={fmtEGP(s.byMethod?.TRANSFER || 0)} icon={TrendingUp} color="text-purple-600" bg="bg-purple-500/10" />
      </div>
      {data.byCategory && data.byCategory.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">المصروفات حسب الفئة</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>الفئة</TableHead>
                    <TableHead className="text-left">عدد المصروفات</TableHead>
                    <TableHead className="text-left">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byCategory.map((c: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-left pos-number">{fmtNum(c.count)}</TableCell>
                      <TableCell className="text-left font-bold pos-number text-red-600">{fmtEGP(c.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">تفاصيل المصروفات</CardTitle></CardHeader>
        <CardContent>
          {data.expenses?.length ? (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>الفئة</TableHead>
                    <TableHead className="text-left">المبلغ</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>الملاحظة</TableHead>
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expenses.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.category?.nameAr || e.category?.name || '—'}</TableCell>
                      <TableCell className="text-left font-bold pos-number text-red-600">{fmtEGP(e.amount)}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-xs ${PAYMENT_BADGE[e.paymentMethod] || ''}`}>{e.paymentMethod}</Badge></TableCell>
                      <TableCell className="text-sm">{e.user?.name || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{e.note || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد تفاصيل</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LoyaltyReport({ data }: any) {
  const s = data.summary || {}
  if (!data.accounts?.length) return <EmptyReport msg="لا توجد حسابات ولاء" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد الحسابات" value={fmtNum(s.accountCount)} icon={Users} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="النقاط الحالية" value={fmtNum(s.totalPoints)} icon={Coins} color="text-amber-600" bg="bg-amber-500/10" />
        <StatCard label="إجمالي المكتسبة" value={fmtNum(s.totalEarned)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="إجمالي المستبدلة" value={fmtNum(s.totalRedeemed)} icon={Wallet} color="text-red-600" bg="bg-red-500/10" />
      </div>
      {s.byTier && Object.keys(s.byTier).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(s.byTier).map(([tier, count]: any) => (
            <StatCard key={tier} label={`فئة ${tier}`} value={fmtNum(count)} icon={Users} />
          ))}
        </div>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">حسابات الولاء</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead className="text-left">النقاط الحالية</TableHead>
                  <TableHead className="text-left">المكتسبة</TableHead>
                  <TableHead className="text-left">المستبدلة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.map((a: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{a.customer?.name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" dir="ltr">{a.customer?.phone || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{a.tier}</Badge></TableCell>
                    <TableCell className="text-left font-bold pos-number text-amber-600">{fmtNum(a.points)}</TableCell>
                    <TableCell className="text-left pos-number text-green-600">{fmtNum(a.totalEarned)}</TableCell>
                    <TableCell className="text-left pos-number text-red-600">{fmtNum(a.totalRedeemed)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function TaxReport({ data }: any) {
  const s = data.summary || {}
  if (!data.sales?.length) return <EmptyReport msg="لا توجد مبيعات" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد الفواتير" value={fmtNum(s.count)} icon={Receipt} color="text-blue-600" bg="bg-blue-500/10" />
        <StatCard label="صافي المبيعات" value={fmtEGP(s.totalSubtotal)} icon={TrendingUp} color="text-green-600" bg="bg-green-500/10" />
        <StatCard label="ضريبة الفواتير" value={fmtEGP(s.totalTax)} icon={Percent} color="text-amber-600" bg="bg-amber-500/10" />
        <StatCard label="ضريبة الأصناف" value={fmtEGP(s.itemLevelTax)} icon={Wallet} color="text-purple-600" bg="bg-purple-500/10" />
        <StatCard label="الإجمالي" value={fmtEGP(s.total)} icon={Coins} color="text-teal-600" bg="bg-teal-500/10" />
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">تفاصيل الضرائب</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead className="text-left">الصافي</TableHead>
                  <TableHead className="text-left">الضريبة</TableHead>
                  <TableHead className="text-left">الإجمالي</TableHead>
                  <TableHead className="text-left">نسبة الضريبة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sales.map((sale: any) => {
                  const taxPct = sale.subtotal > 0 ? (sale.taxAmount / sale.subtotal) * 100 : 0
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono text-xs">{sale.invoiceNumber}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(sale.createdAt)}</TableCell>
                      <TableCell className="text-left pos-number">{fmtEGP(sale.subtotal)}</TableCell>
                      <TableCell className="text-left font-bold pos-number text-amber-600">{fmtEGP(sale.taxAmount)}</TableCell>
                      <TableCell className="text-left pos-number">{fmtEGP(sale.total)}</TableCell>
                      <TableCell className="text-left pos-number">{taxPct.toFixed(2)}%</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
