'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { apiFetch, formatEGP, formatNumber, formatDateTime } from '@/lib/api'
import { generateUUID } from '@/lib/local-db'
import { useAuthStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  ShoppingCart, Search, Eye, Printer, Undo2, Download, RefreshCw,
  DollarSign, Receipt, Percent, TrendingUp, Wallet, Banknote, CreditCard, ArrowLeftRight,
} from 'lucide-react'
import { toast } from 'sonner'

const PERIODS = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'هذا الأسبوع' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'all', label: 'الكل' },
]

const PAYMENT_METHOD_META: Record<string, { label: string; color: string; icon: any }> = {
  CASH: { label: 'نقدي', color: 'bg-green-500/10 text-green-700 border-green-500/20', icon: Banknote },
  CARD: { label: 'بطاقة', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20', icon: CreditCard },
  TRANSFER: { label: 'تحويل', color: 'bg-purple-500/10 text-purple-700 border-purple-500/20', icon: ArrowLeftRight },
  SPLIT: { label: 'مقسّم', color: 'bg-amber-500/10 text-amber-700 border-amber-500/20', icon: Wallet },
  OTHER: { label: 'أخرى', color: 'bg-gray-500/10 text-gray-700 border-gray-500/20', icon: DollarSign },
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-green-500/10 text-green-700 border-green-500/20">مكتملة</Badge>
    case 'REFUNDED':
      return <Badge className="bg-red-500/10 text-red-700 border-red-500/20">مستردة</Badge>
    case 'PARTIAL_REFUND':
      return <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/20">مرتجع جزئي</Badge>
    case 'HELD':
      return <Badge className="bg-gray-500/10 text-gray-700 border-gray-500/20">معلقة</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export function SalesModule() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [search, setSearch] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundTarget, setRefundTarget] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (period !== 'all') params.set('period', period)
      if (search) params.set('search', search)
      if (paymentMethod !== 'all') params.set('paymentMethod', paymentMethod)
      params.set('limit', '200')
      const data = await apiFetch(`/sales?${params.toString()}`)
      setSales(data || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [period, search, paymentMethod])

  useEffect(() => {
    const t = setTimeout(load, 350)
    return () => clearTimeout(t)
  }, [load])

  // Summary
  const stats = useMemo(() => {
    const total = sales.reduce((s, x) => s + (x.total || 0), 0)
    const count = sales.length
    const avg = count > 0 ? total / count : 0
    const profit = sales.reduce((s, x) => {
      const itemsProfit = (x.items || []).reduce((p: number, it: any) => {
        return p + ((it.unitPrice - (it.costAtSale || 0)) * it.quantity)
      }, 0)
      return s + itemsProfit - (x.discountAmount || 0)
    }, 0)
    return { total, count, avg, profit }
  }, [sales])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const data = await apiFetch(`/sales/${id}`)
      setDetail(data)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const openRefund = (sale: any) => {
    setRefundTarget(sale)
    setRefundOpen(true)
  }

  const exportCSV = () => {
    const headers = ['رقم الفاتورة', 'التاريخ', 'العميل', 'الكاشير', 'الإجمالي', 'طريقة الدفع', 'الحالة']
    const lines = [headers.join(',')]
    sales.forEach((s) => {
      const customer = s.customer?.name || ''
      const cashier = s.user?.name || ''
      const pmMeta = PAYMENT_METHOD_META[s.paymentMethod] || { label: s.paymentMethod }
      const statusLabel =
        s.status === 'COMPLETED' ? 'مكتملة' :
        s.status === 'REFUNDED' ? 'مستردة' :
        s.status === 'PARTIAL_REFUND' ? 'مرتجع جزئي' : s.status
      const line = [
        `"${s.invoiceNumber}"`,
        `"${formatDateTime(s.createdAt)}"`,
        `"${customer}"`,
        `"${cashier}"`,
        s.total ?? 0,
        `"${pmMeta.label}"`,
        `"${statusLabel}"`,
      ]
      lines.push(line.join(','))
    })
    const csv = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`تم تصدير ${sales.length} فاتورة`)
  }

  const handlePrint = (sale: any) => {
    if (!sale) return
    // Use print API or fallback to simple window print
    try {
      const win = window.open('', '_blank', 'width=420,height=640')
      if (!win) {
        toast.error('اسمح بالنوافذ المنبثقة للطباعة')
        return
      }
      const itemsHtml = (sale.items || []).map((it: any) => `
        <tr>
          <td>${it.product?.nameAr || it.product?.name || ''}</td>
          <td style="text-align:center">${it.quantity}</td>
          <td style="text-align:left">${formatEGP(it.unitPrice)}</td>
          <td style="text-align:left">${formatEGP(it.total)}</td>
        </tr>
      `).join('')
      win.document.write(`
        <html dir="rtl"><head><title>${sale.invoiceNumber}</title>
        <style>
          body { font-family: 'Tahoma', sans-serif; padding: 16px; font-size: 12px; }
          h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
          h2 { font-size: 14px; text-align: center; margin: 0 0 12px; color: #555; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { padding: 4px 6px; border-bottom: 1px dashed #ccc; font-size: 11px; }
          th { background: #f5f5f5; }
          .totals { margin-top: 12px; }
          .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
          .grand { font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px; }
          .meta { margin: 8px 0; font-size: 11px; color: #555; }
          .footer { text-align: center; margin-top: 16px; color: #777; font-size: 10px; }
        </style></head><body>
          <h1>إيصال بيع</h1>
          <h2>${sale.invoiceNumber}</h2>
          <div class="meta">
            التاريخ: ${formatDateTime(sale.createdAt)}<br/>
            الكاشير: ${sale.user?.name || '—'}<br/>
            العميل: ${sale.customer?.name || 'عميل نقدي'}<br/>
            ${sale.register?.name ? `الدرج: ${sale.register.name}<br/>` : ''}
          </div>
          <table>
            <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="totals">
            <div><span>الإجمالي الفرعي:</span><span>${formatEGP(sale.subtotal)}</span></div>
            <div><span>الخصم:</span><span>- ${formatEGP(sale.discountAmount)}</span></div>
            <div><span>الضريبة:</span><span>${formatEGP(sale.taxAmount)}</span></div>
            <div class="grand"><span>الإجمالي:</span><span>${formatEGP(sale.total)}</span></div>
            <div><span>المدفوع:</span><span>${formatEGP(sale.paidAmount)}</span></div>
            ${sale.changeAmount > 0 ? `<div><span>الباقي:</span><span>${formatEGP(sale.changeAmount)}</span></div>` : ''}
          </div>
          ${sale.loyaltyEarned > 0 ? `<div class="meta">نقاط الولاء المكتسبة: ${sale.loyaltyEarned}</div>` : ''}
          <div class="footer">شكراً لزيارتكم</div>
        </body></html>
      `)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print(); win.close() }, 250)
    } catch (e: any) {
      toast.error('فشل الطباعة: ' + e.message)
    }
  }

  const summaryCards = [
    { label: 'إجمالي المبيعات', value: formatEGP(stats.total), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'عدد الفواتير', value: formatNumber(stats.count), icon: Receipt, color: 'text-blue-600', bg: 'bg-blue-500/10' },
    { label: 'متوسط الفاتورة', value: formatEGP(stats.avg), icon: Percent, color: 'text-purple-600', bg: 'bg-purple-500/10' },
    { label: 'إجمالي الأرباح', value: formatEGP(stats.profit), icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-500/10' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" />
            المبيعات
          </h1>
          <p className="text-muted-foreground text-sm">إدارة الفواتير والمرتجعات</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4" />
            تحديث
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((s, i) => {
          const Icon = s.icon
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                </div>
                <p className="text-lg font-bold pos-number">{s.value}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Period */}
            <div className="flex gap-1 bg-muted p-1 rounded-lg w-full md:w-fit">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`flex-1 md:flex-none px-3 py-1.5 text-sm rounded-md transition-colors ${
                    period === p.value ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الفاتورة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            {/* Payment */}
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="كل الطرق" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الطرق</SelectItem>
                {Object.entries(PAYMENT_METHOD_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sales table */}
      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : sales.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">لا توجد فواتير في الفترة المحددة</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Desktop */}
            <div className="hidden md:block">
              <ScrollArea className="h-[calc(100vh-440px)] min-h-[400px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>الكاشير</TableHead>
                      <TableHead className="text-center">الأصناف</TableHead>
                      <TableHead className="text-left">الإجمالي</TableHead>
                      <TableHead className="text-center">طريقة الدفع</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s) => {
                      const pmMeta = PAYMENT_METHOD_META[s.paymentMethod] || { label: s.paymentMethod, color: '', icon: DollarSign }
                      const PmIcon = pmMeta.icon
                      const itemCount = (s.items || []).reduce((sum: number, it: any) => sum + it.quantity, 0)
                      return (
                        <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(s.id)}>
                          <TableCell className="font-mono font-medium">{s.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">{formatDateTime(s.createdAt)}</TableCell>
                          <TableCell>{s.customer?.name || <span className="text-muted-foreground">عميل نقدي</span>}</TableCell>
                          <TableCell className="text-sm">{s.user?.name || '—'}</TableCell>
                          <TableCell className="text-center text-sm pos-number">{formatNumber(itemCount)}</TableCell>
                          <TableCell className="text-left font-bold pos-number">{formatEGP(s.total)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={pmMeta.color}>
                              <PmIcon className="w-3 h-3" />
                              {pmMeta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{getStatusBadge(s.status)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDetail(s.id)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handlePrint(s)}>
                                <Printer className="w-4 h-4" />
                              </Button>
                              {s.status !== 'REFUNDED' && (
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-orange-600" onClick={() => openRefund(s)}>
                                  <Undo2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y">
              {sales.map((s) => {
                const pmMeta = PAYMENT_METHOD_META[s.paymentMethod] || { label: s.paymentMethod, color: '', icon: DollarSign }
                const PmIcon = pmMeta.icon
                return (
                  <div key={s.id} className="p-4 cursor-pointer hover:bg-muted/30" onClick={() => openDetail(s.id)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="font-mono font-medium text-sm">{s.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-bold pos-number">{formatEGP(s.total)}</p>
                        {getStatusBadge(s.status)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{s.customer?.name || 'عميل نقدي'}</span>
                      <Badge variant="outline" className={pmMeta.color}>
                        <PmIcon className="w-3 h-3" />
                        {pmMeta.label}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(o) => { if (!o) { setDetail(null); setDetailLoading(false) } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailLoading ? (
            <div className="py-8">
              <Skeleton className="h-8 w-48 mb-4" />
              <Skeleton className="h-32 w-full mb-4" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : detail ? (
            <SaleDetail
              sale={detail}
              onClose={() => setDetail(null)}
              onPrint={() => handlePrint(detail)}
              onRefund={() => { setDetail(null); openRefund(detail) }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <RefundDialog
        sale={refundTarget}
        open={refundOpen}
        onClose={() => { setRefundOpen(false); setRefundTarget(null) }}
        onDone={() => { setRefundOpen(false); setRefundTarget(null); load() }}
      />
    </div>
  )
}

// ============ SALE DETAIL ============
function SaleDetail({ sale, onClose, onPrint, onRefund }: {
  sale: any
  onClose: () => void
  onPrint: () => void
  onRefund: () => void
}) {
  const pmMeta = PAYMENT_METHOD_META[sale.paymentMethod] || { label: sale.paymentMethod, color: '', icon: DollarSign }
  const PmIcon = pmMeta.icon
  const itemCount = (sale.items || []).reduce((sum: number, it: any) => sum + it.quantity, 0)
  const hasReturns = (sale.returns || []).length > 0
  const totalRefunded = (sale.returns || []).reduce((s: number, r: any) => s + (r.total || 0), 0)

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          {sale.invoiceNumber}
        </DialogTitle>
        <DialogDescription>تفاصيل الفاتورة</DialogDescription>
      </DialogHeader>

      {/* Meta info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">التاريخ</p>
          <p className="font-medium">{formatDateTime(sale.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الكاشير</p>
          <p className="font-medium">{sale.user?.name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">العميل</p>
          <p className="font-medium">{sale.customer?.name || 'عميل نقدي'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الدرج</p>
          <p className="font-medium">{sale.register?.name || '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {getStatusBadge(sale.status)}
        <Badge variant="outline" className={pmMeta.color}>
          <PmIcon className="w-3 h-3" />
          {pmMeta.label}
        </Badge>
        {hasReturns && (
          <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/20">
            مرتجع: {formatEGP(totalRefunded)}
          </Badge>
        )}
      </div>

      <Separator />

      {/* Items */}
      <div>
        <p className="text-sm font-semibold mb-2">الأصناف ({formatNumber(itemCount)})</p>
        <ScrollArea className="max-h-72">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الصنف</TableHead>
                <TableHead className="text-center">الكمية</TableHead>
                <TableHead className="text-left">السعر</TableHead>
                <TableHead className="text-left">الضريبة</TableHead>
                <TableHead className="text-left">الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sale.items || []).map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">
                    {it.product?.nameAr || it.product?.name || '—'}
                    {it.product?.sku && <span className="text-xs text-muted-foreground block font-mono">{it.product.sku}</span>}
                  </TableCell>
                  <TableCell className="text-center pos-number">{formatNumber(it.quantity)}</TableCell>
                  <TableCell className="text-left pos-number">{formatEGP(it.unitPrice)}</TableCell>
                  <TableCell className="text-left text-sm text-muted-foreground pos-number">{formatEGP(it.taxAmount)}</TableCell>
                  <TableCell className="text-left font-bold pos-number">{formatEGP(it.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <Separator />

      {/* Totals & Payments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">الإجمالي الفرعي</span><span className="pos-number">{formatEGP(sale.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">الخصم</span><span className="pos-number text-red-600">- {formatEGP(sale.discountAmount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">الضريبة</span><span className="pos-number">{formatEGP(sale.taxAmount)}</span></div>
          <Separator />
          <div className="flex justify-between font-bold text-base">
            <span>الإجمالي</span>
            <span className="pos-number text-primary">{formatEGP(sale.total)}</span>
          </div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">المدفوع</span><span className="pos-number">{formatEGP(sale.paidAmount)}</span></div>
          {sale.changeAmount > 0 && (
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">الباقي</span><span className="pos-number">{formatEGP(sale.changeAmount)}</span></div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">المدفوعات</p>
          {(sale.payments || []).length > 0 ? (
            <div className="space-y-1.5">
              {(sale.payments || []).map((p: any, i: number) => {
                const m = PAYMENT_METHOD_META[p.method] || { label: p.method, color: '', icon: DollarSign }
                const Icon = m.icon
                return (
                  <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <Badge variant="outline" className={m.color}>
                      <Icon className="w-3 h-3" />
                      {m.label}
                    </Badge>
                    <span className="font-medium pos-number">{formatEGP(p.amount)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا تفاصيل مدفوعات</p>
          )}

          {(sale.loyaltyEarned > 0 || sale.loyaltyRedeemed > 0) && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-sm space-y-1">
              <p className="font-medium text-amber-800">معلومات الولاء</p>
              {sale.loyaltyEarned > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">نقاط مكتسبة</span><span className="font-medium">+{sale.loyaltyEarned}</span></div>
              )}
              {sale.loyaltyRedeemed > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">نقاط مستبدلة</span><span className="font-medium">-{sale.loyaltyRedeemed}</span></div>
              )}
            </div>
          )}
        </div>
      </div>

      {sale.note && (
        <>
          <Separator />
          <div>
            <p className="text-sm font-semibold mb-1">ملاحظات</p>
            <p className="text-sm text-muted-foreground">{sale.note}</p>
          </div>
        </>
      )}

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>إغلاق</Button>
        {sale.status !== 'REFUNDED' && (
          <Button variant="outline" className="text-orange-600 border-orange-500/30" onClick={onRefund}>
            <Undo2 className="w-4 h-4" />
            استرجاع
          </Button>
        )}
        <Button onClick={onPrint}>
          <Printer className="w-4 h-4" />
          طباعة
        </Button>
      </DialogFooter>
    </>
  )
}

// ============ REFUND DIALOG ============
function RefundDialog({ sale, open, onClose, onDone }: {
  sale: any | null
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { user } = useAuthStore()
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [refundMethod, setRefundMethod] = useState('CASH')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (sale) {
      const init: Record<string, number> = {}
      ;(sale.items || []).forEach((it: any) => { init[it.id] = 0 })
      setQuantities(init)
      setReason('')
      setReasonNote('')
      setRefundMethod(sale.paymentMethod || 'CASH')
    }
  }, [sale])

  const refundItems = useMemo(() => {
    if (!sale) return []
    return (sale.items || [])
      .map((it: any) => ({ ...it, refundQty: quantities[it.id] || 0 }))
      .filter((it: any) => it.refundQty > 0)
  }, [sale, quantities])

  const refundTotal = refundItems.reduce((s, it) => {
    const unitTotal = it.total / it.quantity
    return s + unitTotal * it.refundQty
  }, 0)

  const handleSubmit = async () => {
    if (!sale) return
    if (refundItems.length === 0) {
      toast.error('اختر صنفاً واحداً على الأقل للاسترجاع')
      return
    }
    if (!reason) {
      toast.error('اختر سبب الاسترجاع')
      return
    }
    // Validate quantities
    for (const it of refundItems) {
      if (it.refundQty > it.quantity) {
        toast.error(`الكمية المرتجعة أكبر من المباعة لـ ${it.product?.nameAr || it.product?.name}`)
        return
      }
    }
    setSaving(true)
    try {
      // Idempotency: stable clientTxnId survives retries. The refund endpoint
      // writes sale_returns + sale_return_items + reverses stock_movements +
      // reverses loyalty_transactions + (if cash) inserts a REFUND cash_movement
      // + queues a sync op. A duplicate refund would silently double-reverse
      // stock and double-credit loyalty, so we guard with X-Client-Txn-Id
      // server-side AND body.clientTxnId for the desktop SQLite handler.
      const clientTxnId = generateUUID()
      await apiFetch(`/sales/${sale.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          items: refundItems.map((it) => ({ saleItemId: it.id, quantity: it.refundQty })),
          reason: reasonNote ? `${reason} - ${reasonNote}` : reason,
          refundMethod,
          userId: user?.id,
          clientTxnId,
        }),
      })
      toast.success('تم معالجة المرتجع بنجاح')
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!sale) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-orange-600" />
            استرجاع فاتورة
          </DialogTitle>
          <DialogDescription>
            {sale.invoiceNumber} — إجمالي: {formatEGP(sale.total)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">حدد الكميات المراد استرجاعها:</p>
          <ScrollArea className="max-h-72">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead className="text-center">المباعة</TableHead>
                  <TableHead className="text-center">المرتجعة</TableHead>
                  <TableHead className="text-left">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sale.items || []).map((it: any) => {
                  const qty = quantities[it.id] || 0
                  const max = it.quantity
                  const unitTotal = it.total / it.quantity
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.product?.nameAr || it.product?.name || '—'}
                        <span className="text-xs text-muted-foreground block pos-number">{formatEGP(it.unitPrice)} / وحدة</span>
                      </TableCell>
                      <TableCell className="text-center pos-number">{formatNumber(it.quantity)}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min={0}
                          max={max}
                          value={qty}
                          onChange={(e) => {
                            const v = Math.min(Math.max(parseInt(e.target.value) || 0, 0), max)
                            setQuantities({ ...quantities, [it.id]: v })
                          }}
                          className="w-20 mx-auto text-center"
                        />
                      </TableCell>
                      <TableCell className="text-left font-bold pos-number">{formatEGP(unitTotal * qty)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="rounded-md bg-orange-500/10 border border-orange-500/20 p-3 flex justify-between items-center">
            <span className="text-sm font-medium">إجمالي الاسترجاع</span>
            <span className="text-lg font-bold text-orange-700 pos-number">{formatEGP(refundTotal)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>طريقة استرجاع المبلغ</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">نقدي</SelectItem>
                  <SelectItem value="CARD">بطاقة</SelectItem>
                  <SelectItem value="TRANSFER">تحويل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>سبب الاسترجاع *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر السبب" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEFECTIVE">منتج معيب</SelectItem>
                  <SelectItem value="WRONG_ITEM">صنف خاطئ</SelectItem>
                  <SelectItem value="CUSTOMER_RETURN">استرجاع العميل</SelectItem>
                  <SelectItem value="DAMAGED">تالف</SelectItem>
                  <SelectItem value="OTHER">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات إضافية</Label>
            <Textarea
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              rows={2}
              placeholder="تفاصيل إضافية عن سبب الاسترجاع..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || refundItems.length === 0}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Undo2 className="w-4 h-4" />
            {saving ? 'جاري المعالجة...' : `تأكيد الاسترجاع (${formatEGP(refundTotal)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
