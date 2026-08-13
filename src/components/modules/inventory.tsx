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
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Package, Search, Boxes, AlertTriangle, PackageX, Wallet, SlidersHorizontal,
  ArrowDownToLine, ArrowUpFromLine, RefreshCw, History, TrendingUp, TrendingDown, Settings2,
} from 'lucide-react'
import { toast } from 'sonner'

const MOVEMENT_TYPE_META: Record<string, { label: string; color: string; icon: any }> = {
  PURCHASE: { label: 'شراء', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20', icon: ArrowDownToLine },
  SALE: { label: 'بيع', color: 'bg-red-500/10 text-red-700 border-red-500/20', icon: ArrowUpFromLine },
  RETURN: { label: 'مرتجع', color: 'bg-green-500/10 text-green-700 border-green-500/20', icon: ArrowDownToLine },
  ADJUSTMENT: { label: 'تسوية', color: 'bg-amber-500/10 text-amber-700 border-amber-500/20', icon: SlidersHorizontal },
  TRANSFER_IN: { label: 'تحويل وارد', color: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20', icon: ArrowDownToLine },
  TRANSFER_OUT: { label: 'تحويل صادر', color: 'bg-orange-500/10 text-orange-700 border-orange-500/20', icon: ArrowUpFromLine },
  DAMAGE: { label: 'تالف', color: 'bg-rose-500/10 text-rose-700 border-rose-500/20', icon: PackageX },
  OPENING_STOCK: { label: 'رصيد افتتاحي', color: 'bg-purple-500/10 text-purple-700 border-purple-500/20', icon: Boxes },
}

const ADJUSTMENT_REASONS = [
  { value: 'DAMAGE', label: 'تالف' },
  { value: 'LOSS', label: 'مفقود' },
  { value: 'THEFT', label: 'مسروق' },
  { value: 'COUNT', label: 'جرد' },
  { value: 'CORRECTION', label: 'تصحيح' },
  { value: 'SAMPLE', label: 'عينة' },
  { value: 'OTHER', label: 'أخرى' },
]

export function InventoryModule() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Boxes className="w-6 h-6 text-primary" />
          المخزون
        </h1>
        <p className="text-muted-foreground text-sm">إدارة المخزون والحركات والتسويات</p>
      </div>

      <Tabs defaultValue="current">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="current"><Boxes className="w-4 h-4" /> المخزون الحالي</TabsTrigger>
          <TabsTrigger value="movements"><History className="w-4 h-4" /> حركات المخزون</TabsTrigger>
          <TabsTrigger value="adjust"><SlidersHorizontal className="w-4 h-4" /> تسوية المخزون</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4">
          <CurrentStockTab />
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <MovementsTab />
        </TabsContent>
        <TabsContent value="adjust" className="mt-4">
          <AdjustTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============ TAB 1: CURRENT STOCK ============
function CurrentStockTab() {
  const [data, setData] = useState<{ products: any[]; summary: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [outOfStockOnly, setOutOfStockOnly] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (lowStockOnly) params.set('filter', 'lowStock')
      else if (outOfStockOnly) params.set('filter', 'outOfStock')
      params.set('limit', '500')
      const result = await apiFetch(`/inventory?${params.toString()}`)
      setData(result)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, lowStockOnly, outOfStockOnly])

  useEffect(() => {
    const t = setTimeout(load, 350)
    return () => clearTimeout(t)
  }, [load])

  const summary = data?.summary

  const summaryCards = [
    { label: 'قيمة المخزون', value: summary ? formatEGP(summary.totalStockValue) : '—', icon: Wallet, color: 'text-teal-600', bg: 'bg-teal-500/10' },
    { label: 'عدد المنتجات', value: summary ? formatNumber(summary.totalProducts) : '—', icon: Package, color: 'text-blue-600', bg: 'bg-blue-500/10' },
    { label: 'مخزون منخفض', value: summary ? formatNumber(summary.lowStockCount) : '—', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-500/10' },
    { label: 'نفد المخزون', value: summary ? formatNumber(summary.outOfStockCount) : '—', icon: PackageX, color: 'text-red-600', bg: 'bg-red-500/10' },
  ]

  return (
    <div className="space-y-4">
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
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم، SKU، أو الباركود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={lowStockOnly ? 'default' : 'outline'}
                onClick={() => { setLowStockOnly(!lowStockOnly); setOutOfStockOnly(false) }}
                size="sm"
              >
                <AlertTriangle className="w-4 h-4" />
                منخفض
              </Button>
              <Button
                variant={outOfStockOnly ? 'default' : 'outline'}
                onClick={() => { setOutOfStockOnly(!outOfStockOnly); setLowStockOnly(false) }}
                size="sm"
              >
                <PackageX className="w-4 h-4" />
                نفد
              </Button>
              <Button variant="ghost" size="sm" onClick={load}>
                <RefreshCw className="w-4 h-4" />
                تحديث
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : !data || data.products.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Boxes className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">لا توجد منتجات مطابقة</p>
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
                      <TableHead>المنتج</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead className="text-center">المخزون</TableHead>
                      <TableHead className="text-center">الحد الأدنى</TableHead>
                      <TableHead className="text-center">حد إعادة الطلب</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-left">قيمة المخزون</TableHead>
                      <TableHead className="text-center">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.nameAr || p.name}
                          {p.category && (
                            <span className="text-xs text-muted-foreground block">{p.category.nameAr || p.category.name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{p.barcode || '—'}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold pos-number ${
                            p.isOutOfStock ? 'text-red-600' : p.isLowStock ? 'text-orange-600' : 'text-green-600'
                          }`}>{formatNumber(p.currentStock)}</span>
                        </TableCell>
                        <TableCell className="text-center text-sm pos-number">{formatNumber(p.minStock)}</TableCell>
                        <TableCell className="text-center text-sm pos-number">{formatNumber(p.reorderLevel)}</TableCell>
                        <TableCell className="text-center">
                          {p.isOutOfStock ? (
                            <Badge className="bg-red-500/10 text-red-700 border-red-500/20">نفد</Badge>
                          ) : p.isLowStock ? (
                            <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/20">منخفض</Badge>
                          ) : (
                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20">متوفر</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-left pos-number">{formatEGP(p.stockValue)}</TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline" onClick={() => setAdjustProduct(p)}>
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            تسوية
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y">
              {data.products.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium">{p.nameAr || p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.barcode || p.sku}</p>
                    </div>
                    {p.isOutOfStock ? (
                      <Badge className="bg-red-500/10 text-red-700 border-red-500/20">نفد</Badge>
                    ) : p.isLowStock ? (
                      <Badge className="bg-orange-500/10 text-orange-700 border-orange-500/20">منخفض</Badge>
                    ) : (
                      <Badge className="bg-green-500/10 text-green-700 border-green-500/20">متوفر</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>المخزون: <span className={`font-bold ${
                      p.isOutOfStock ? 'text-red-600' : p.isLowStock ? 'text-orange-600' : 'text-green-600'
                    }`}>{formatNumber(p.currentStock)}</span></div>
                    <div>القيمة: <span className="font-medium">{formatEGP(p.stockValue)}</span></div>
                  </div>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setAdjustProduct(p)}>
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    تسوية المخزون
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Adjust dialog */}
      <AdjustDialog
        product={adjustProduct}
        onClose={() => setAdjustProduct(null)}
        onDone={() => { setAdjustProduct(null); load() }}
      />
    </div>
  )
}

// ============ ADJUSTMENT DIALOG ============
function AdjustDialog({ product, onClose, onDone }: { product: any | null; onClose: () => void; onDone: () => void }) {
  const { user } = useAuthStore()
  const [newQty, setNewQty] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (product) {
      setNewQty(String(product.currentStock ?? 0))
      setReason('')
      setNote('')
    }
  }, [product])

  const diff = product ? (parseInt(newQty) || 0) - (product.currentStock ?? 0) : 0
  const warehouseId = product?.stockLevels?.[0]?.warehouseId || product?.stockLevels?.[0]?.warehouse?.id

  const handleSubmit = async () => {
    if (!product) return
    if (!warehouseId) {
      toast.error('لا يوجد مخزن مرتبط بهذا المنتج')
      return
    }
    if (!reason) {
      toast.error('يرجى اختيار سبب التعديل')
      return
    }
    if (newQty === '' || newQty === null) {
      toast.error('أدخل الكمية الجديدة')
      return
    }
    setSaving(true)
    try {
      // Idempotency: a stock adjustment writes stock_adjustments + a
      // stock_movements ADJUSTMENT row + recomputes product currentStock +
      // queues a sync op. A duplicate would shift stock by 2× the delta.
      // Guard with X-Client-Txn-Id (server) + body.clientTxnId (desktop
      // stock_movements.client_txn_id UNIQUE partial index).
      const clientTxnId = generateUUID()
      await apiFetch('/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          newQuantity: parseInt(newQty) || 0,
          reason,
          note,
          userId: user?.id,
          clientTxnId,
        }),
      })
      toast.success('تم تعديل المخزون بنجاح')
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5" />
            تسوية المخزون
          </DialogTitle>
          <DialogDescription>
            {product?.nameAr || product?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">المخزون الحالي</p>
              <p className="text-xl font-bold pos-number">{formatNumber(product?.currentStock ?? 0)}</p>
            </div>
            <div className={`rounded-md p-3 text-center ${
              diff > 0 ? 'bg-green-500/10' : diff < 0 ? 'bg-red-500/10' : 'bg-muted/50'
            }`}>
              <p className="text-xs text-muted-foreground mb-1">الفرق</p>
              <p className={`text-xl font-bold pos-number ${
                diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''
              }`}>{diff > 0 ? '+' : ''}{formatNumber(diff)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>الكمية الجديدة</Label>
            <Input
              type="number"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="text-lg font-bold"
            />
          </div>

          <div className="space-y-1.5">
            <Label>سبب التعديل *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full"><SelectValue placeholder="اختر السبب" /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="تفاصيل إضافية..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={saving || diff === 0}>
            {saving ? 'جاري الحفظ...' : 'تأكيد التسوية'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ TAB 2: MOVEMENTS ============
function MovementsTab() {
  const [data, setData] = useState<{ movements: any[]; pagination: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      params.set('limit', '200')
      const result = await apiFetch(`/inventory/movements?${params.toString()}`)
      setData(result)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [typeFilter, dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="كل الأنواع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {Object.entries(MOVEMENT_TYPE_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">من تاريخ</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={load} className="self-end">
              <RefreshCw className="w-4 h-4" />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : !data || data.movements.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <History className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">لا توجد حركات مخزون مطابقة</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-320px)] min-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead>المرجع</TableHead>
                    <TableHead>المخزن</TableHead>
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.movements.map((m) => {
                    const meta = MOVEMENT_TYPE_META[m.type] || { label: m.type, color: 'bg-gray-500/10 text-gray-700 border-gray-500/20' }
                    const isOut = m.quantity < 0
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          {m.product?.nameAr || m.product?.name || '—'}
                          <span className="text-xs text-muted-foreground block font-mono">{m.product?.sku}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={meta.color} variant="outline">
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center gap-1 font-bold pos-number ${
                            isOut ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {isOut ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                            {isOut ? '' : '+'}{formatNumber(m.quantity)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.refType ? `${m.refType}${m.refId ? ` · ${m.refId.slice(-6)}` : ''}` : '—'}
                          {m.note && <span className="text-xs text-muted-foreground block">{m.note}</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.warehouse?.name || '—'}</TableCell>
                        <TableCell className="text-sm">{formatDateTime(m.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ TAB 3: MANUAL ADJUSTMENT FORM ============
function AdjustTab() {
  const { user } = useAuthStore()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [productId, setProductId] = useState('')
  const [newQty, setNewQty] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch('/inventory?limit=500')
      .then((r) => setProducts(r?.products || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const selected = products.find((p) => p.id === productId)
  const currentStock = selected?.currentStock ?? 0
  const diff = selected ? (parseInt(newQty) || 0) - currentStock : 0
  const warehouseId = selected?.stockLevels?.[0]?.warehouseId || selected?.stockLevels?.[0]?.warehouse?.id

  const handleSubmit = async () => {
    if (!productId) { toast.error('اختر المنتج'); return }
    if (!warehouseId) { toast.error('لا يوجد مخزن مرتبط'); return }
    if (newQty === '') { toast.error('أدخل الكمية الجديدة'); return }
    if (!reason) { toast.error('اختر سبب التعديل'); return }
    setSaving(true)
    try {
      // Idempotency: same rationale as the dialog above — adjustment writes
      // stock_adjustments + stock_movements + recomputes currentStock + sync
      // queue op. Duplicate would double-shift stock. Guard with header +
      // body.clientTxnId.
      const clientTxnId = generateUUID()
      await apiFetch('/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          productId, warehouseId,
          newQuantity: parseInt(newQty) || 0,
          reason, note,
          userId: user?.id,
          clientTxnId,
        }),
      })
      toast.success('تم تعديل المخزون بنجاح')
      setProductId(''); setNewQty(''); setReason(''); setNote('')
      // refresh products
      const r = await apiFetch('/inventory?limit=500')
      setProducts(r?.products || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            تسوية مخزون
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>المنتج *</Label>
            <Select value={productId} onValueChange={(v) => { setProductId(v); setNewQty('') }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="ابحث واختر المنتج..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nameAr || p.name} — مخزون: {p.currentStock}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">الحالي</p>
                <p className="text-lg font-bold pos-number">{formatNumber(currentStock)}</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">الجديد</p>
                <p className="text-lg font-bold pos-number">{formatNumber(parseInt(newQty) || 0)}</p>
              </div>
              <div className={`rounded-md p-3 text-center ${
                diff > 0 ? 'bg-green-500/10' : diff < 0 ? 'bg-red-500/10' : 'bg-muted/50'
              }`}>
                <p className="text-xs text-muted-foreground mb-1">الفرق</p>
                <p className={`text-lg font-bold pos-number ${
                  diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''
                }`}>{diff > 0 ? '+' : ''}{formatNumber(diff)}</p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>الكمية الجديدة *</Label>
            <Input
              type="number"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="0"
              disabled={!productId}
              className="text-lg font-bold"
            />
          </div>

          <div className="space-y-1.5">
            <Label>سبب التعديل *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full"><SelectValue placeholder="اختر السبب" /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="تفاصيل إضافية عن التعديل..." />
          </div>

          <Separator />

          <Button onClick={handleSubmit} disabled={saving || !productId || !reason || diff === 0} className="w-full" size="lg">
            <SlidersHorizontal className="w-4 h-4" />
            {saving ? 'جاري الحفظ...' : 'تنفيذ التسوية'}
          </Button>
        </CardContent>
      </Card>

      {/* Quick stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">إرشادات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <TrendingUp className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <p>إذا كانت الكمية الجديدة أكبر من الحالية، سيتم إضافة مخزون وإنشاء حركة موجبة.</p>
          </div>
          <div className="flex gap-2">
            <TrendingDown className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p>إذا كانت الكمية الجديدة أقل من الحالية، سيتم خصم مخزون وإنشاء حركة سالبة.</p>
          </div>
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>يتم تسجيل كل تسوية في سجل المراجعة (Audit Log) للشفافية والمساءلة.</p>
          </div>
          <div className="flex gap-2">
            <Boxes className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>الفرق = الكمية الجديدة − الحالية. لا يمكن تطبيق تسوية بفرق صفري.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
