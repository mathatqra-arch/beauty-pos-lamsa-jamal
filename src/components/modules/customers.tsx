'use client'

import { useEffect, useState, useMemo } from 'react'
import { apiFetch, formatEGP, formatNumber, formatDate, formatDateTime } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  Plus, Search, Pencil, Users, Crown, Download, RefreshCw, Phone, Mail, MapPin,
  Cake, Star, ShoppingBag, Coins, TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'

interface CustomerFormState {
  name: string
  phone: string
  email: string
  address: string
  birthday: string
  notes: string
  tier: string
}

const EMPTY_FORM: CustomerFormState = {
  name: '', phone: '', email: '', address: '', birthday: '', notes: '', tier: 'BRONZE',
}

const TIER_META: Record<string, { label: string; className: string }> = {
  BRONZE: { label: 'برونزي', className: 'bg-amber-700/10 text-amber-800 border-amber-700/30' },
  SILVER: { label: 'فضي', className: 'bg-gray-400/10 text-gray-700 border-gray-400/30' },
  GOLD: { label: 'ذهبي', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  VIP: { label: 'VIP', className: 'bg-purple-500/10 text-purple-700 border-purple-500/30' },
}

function TierBadge({ tier }: { tier: string }) {
  const meta = TIER_META[tier] || TIER_META.BRONZE
  return (
    <Badge variant="outline" className={meta.className}>
      <Crown className="w-3 h-3 ml-1" />
      {meta.label}
    </Badge>
  )
}

export function CustomersModule() {
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (tierFilter !== 'all') params.set('tier', tierFilter)
      params.set('limit', '500')
      const data = await apiFetch(`/customers?${params.toString()}`)
      setCustomers(data || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 350)
    return () => clearTimeout(t)
  }, [search, tierFilter])

  const stats = useMemo(() => {
    const total = customers.length
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const newThisMonth = customers.filter((c) => new Date(c.createdAt) >= monthStart).length
    const vipCount = customers.filter((c) => c.tier === 'VIP').length
    const totalSpend = customers.reduce((s, c) => s + (c.loyaltyAccount?.totalEarned || 0) * 0.05, 0)
    const avgSpend = total > 0 ? totalSpend / total : 0
    return { total, newThisMonth, vipCount, avgSpend }
  }, [customers])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (c: any) => {
    setEditing(c)
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      birthday: c.birthday ? new Date(c.birthday).toISOString().slice(0, 10) : '',
      notes: c.notes || '',
      tier: c.tier || 'BRONZE',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name) {
      toast.error('اسم العميل مطلوب')
      return
    }
    setSaving(true)
    try {
      const body: any = { ...form }
      if (!body.birthday) delete body.birthday
      if (editing) {
        await apiFetch(`/customers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('تم تحديث العميل')
      } else {
        await apiFetch('/customers', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('تم إنشاء العميل بنجاح')
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const openDetail = async (c: any) => {
    setDetailLoading(true)
    setDetail({ ...c, _loading: true })
    try {
      const full = await apiFetch(`/customers/${c.id}`)
      setDetail(full)
    } catch (e: any) {
      toast.error(e.message)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const exportCSV = () => {
    const headers = ['الاسم', 'الهاتف', 'البريد', 'الفئة', 'إجمالي الطلبات', 'إجمالي الإنفاق', 'نقاط الولاء']
    const lines = [headers.join(',')]
    customers.forEach((c) => {
      const lines_total = c._count?.sales || 0
      const totalEarned = c.loyaltyAccount?.totalEarned || 0
      const totalSpend = totalEarned * 0.05
      const line = [
        `"${c.name || ''}"`,
        `"${c.phone || ''}"`,
        `"${c.email || ''}"`,
        `"${TIER_META[c.tier]?.label || c.tier}"`,
        lines_total,
        totalSpend.toFixed(2),
        c.loyaltyAccount?.points || 0,
      ]
      lines.push(line.join(','))
    })
    const csv = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`تم تصدير ${customers.length} عميل`)
  }

  const summaryCards = [
    { label: 'إجمالي العملاء', value: formatNumber(stats.total), icon: Users, color: 'text-blue-600', bg: 'bg-blue-500/10' },
    { label: 'عملاء جدد (هذا الشهر)', value: formatNumber(stats.newThisMonth), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'عملاء VIP', value: formatNumber(stats.vipCount), icon: Crown, color: 'text-purple-600', bg: 'bg-purple-500/10' },
    { label: 'متوسط الإنفاق', value: formatEGP(stats.avgSpend), icon: Coins, color: 'text-amber-600', bg: 'bg-amber-500/10' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            العملاء
          </h1>
          <p className="text-muted-foreground text-sm">إدارة بيانات العملاء وبرنامج الولاء</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={customers.length === 0}>
            <Download className="w-4 h-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4" />
            تحديث
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4" />
            إضافة عميل
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {summaryCards.map((card, i) => {
          const Icon = card.icon
          return (
            <Card key={i}>
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                <p className="text-lg md:text-xl font-bold pos-number">{card.value}</p>
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
                placeholder="ابحث بالاسم أو الهاتف أو البريد..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                <SelectItem value="BRONZE">برونزي</SelectItem>
                <SelectItem value="SILVER">فضي</SelectItem>
                <SelectItem value="GOLD">ذهبي</SelectItem>
                <SelectItem value="VIP">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table / Cards */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا يوجد عملاء</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead className="text-center">الطلبات</TableHead>
                    <TableHead className="text-center">الإنفاق</TableHead>
                    <TableHead className="text-center">نقاط الولاء</TableHead>
                    <TableHead>آخر شراء</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => {
                    const totalSpend = (c.loyaltyAccount?.totalEarned || 0) * 0.05
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(c)}
                      >
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{c.email || '—'}</TableCell>
                        <TableCell><TierBadge tier={c.tier} /></TableCell>
                        <TableCell className="text-center pos-number">{formatNumber(c._count?.sales || 0)}</TableCell>
                        <TableCell className="text-center pos-number">{formatEGP(totalSpend)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="pos-number">
                            {formatNumber(c.loyaltyAccount?.points || 0)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {c.updatedAt ? formatDate(c.updatedAt) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {customers.map((c) => {
              const totalSpend = (c.loyaltyAccount?.totalEarned || 0) * 0.05
              return (
                <Card key={c.id} onClick={() => openDetail(c)} className="cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone || '—'}</p>
                      </div>
                      <TierBadge tier={c.tier} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">الطلبات</p>
                        <p className="font-bold text-sm pos-number">{formatNumber(c._count?.sales || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">الإنفاق</p>
                        <p className="font-bold text-sm pos-number">{formatEGP(totalSpend)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">النقاط</p>
                        <p className="font-bold text-sm pos-number">{formatNumber(c.loyaltyAccount?.points || 0)}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full mt-3" onClick={(e) => { e.stopPropagation(); openEdit(c) }}>
                      <Pencil className="w-4 h-4" />
                      تعديل
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل عميل' : 'إضافة عميل'}</DialogTitle>
            <DialogDescription>
              {editing ? 'تحديث بيانات العميل' : 'إنشاء عميل جديد مع حساب ولاء تلقائي'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="name">الاسم *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="اسم العميل"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="phone">الهاتف</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="birthday">تاريخ الميلاد</Label>
                <Input
                  id="birthday"
                  type="date"
                  value={form.birthday}
                  onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="customer@example.com"
                dir="ltr"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">العنوان</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="العنوان"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tier">الفئة</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRONZE">برونزي</SelectItem>
                  <SelectItem value="SILVER">فضي</SelectItem>
                  <SelectItem value="GOLD">ذهبي</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="ملاحظات إضافية"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {detail?.name || 'تفاصيل العميل'}
              {detail?.tier && <TierBadge tier={detail.tier} />}
            </DialogTitle>
            <DialogDescription>ملف العميل وسجل المشتريات والولاء</DialogDescription>
          </DialogHeader>

          {detailLoading || detail?._loading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-40" />
            </div>
          ) : detail ? (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4 pr-1">
                {/* Profile */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="flex items-start gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">الهاتف</p>
                      <p className="text-sm" dir="ltr">{detail.phone || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">البريد</p>
                      <p className="text-sm" dir="ltr">{detail.email || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">العنوان</p>
                      <p className="text-sm">{detail.address || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Cake className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">الميلاد</p>
                      <p className="text-sm">{detail.birthday ? formatDate(detail.birthday) : '—'}</p>
                    </div>
                  </div>
                </div>

                {detail.notes && (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
                    <p className="text-sm">{detail.notes}</p>
                  </div>
                )}

                {/* Loyalty account */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    حساب الولاء
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-center">
                      <p className="text-xs text-muted-foreground">النقاط الحالية</p>
                      <p className="text-lg font-bold pos-number text-purple-700">
                        {formatNumber(detail.loyaltyAccount?.points || 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-center">
                      <p className="text-xs text-muted-foreground">إجمالي المكتسبة</p>
                      <p className="text-lg font-bold pos-number text-green-700">
                        {formatNumber(detail.loyaltyAccount?.totalEarned || 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-center">
                      <p className="text-xs text-muted-foreground">إجمالي المستبدلة</p>
                      <p className="text-lg font-bold pos-number text-orange-700">
                        {formatNumber(detail.loyaltyAccount?.totalRedeemed || 0)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
                      <p className="text-xs text-muted-foreground">قيمة النقاط</p>
                      <p className="text-lg font-bold pos-number text-blue-700">
                        {formatEGP((detail.loyaltyAccount?.points || 0) * 0.05)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recent sales */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-blue-500" />
                    آخر المشتريات
                  </h3>
                  {detail.sales && detail.sales.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>رقم الفاتورة</TableHead>
                            <TableHead>التاريخ</TableHead>
                            <TableHead className="text-center">الأصناف</TableHead>
                            <TableHead className="text-center">الإجمالي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.sales.map((s: any) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-mono text-xs">{s.invoiceNumber}</TableCell>
                              <TableCell className="text-sm">{formatDateTime(s.createdAt)}</TableCell>
                              <TableCell className="text-center pos-number">{formatNumber(s.items?.length || 0)}</TableCell>
                              <TableCell className="text-center pos-number font-medium">{formatEGP(s.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-3 text-center">لا توجد مشتريات</p>
                  )}
                </div>

                {/* Loyalty transactions */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-500" />
                    حركات الولاء
                  </h3>
                  {detail.loyaltyTransactions && detail.loyaltyTransactions.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>النوع</TableHead>
                            <TableHead className="text-center">النقاط</TableHead>
                            <TableHead>المرجع</TableHead>
                            <TableHead>التاريخ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.loyaltyTransactions.map((t: any) => (
                            <TableRow key={t.id}>
                              <TableCell>
                                <Badge variant="outline" className={
                                  t.type === 'EARN' ? 'bg-green-500/10 text-green-700 border-green-500/20' :
                                  t.type === 'REDEEM' ? 'bg-orange-500/10 text-orange-700 border-orange-500/20' :
                                  t.type === 'BONUS' ? 'bg-blue-500/10 text-blue-700 border-blue-500/20' :
                                  t.type === 'REVERSE' ? 'bg-red-500/10 text-red-700 border-red-500/20' :
                                  'bg-gray-500/10 text-gray-700 border-gray-500/20'
                                }>
                                  {t.type === 'EARN' ? 'كسب' :
                                   t.type === 'REDEEM' ? 'استبدال' :
                                   t.type === 'BONUS' ? 'مكافأة' :
                                   t.type === 'REVERSE' ? 'عكس' :
                                   t.type === 'EXPIRE' ? 'انتهاء' : t.type}
                                </Badge>
                              </TableCell>
                              <TableCell className={`text-center pos-number font-medium ${t.points < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {t.points > 0 ? '+' : ''}{formatNumber(t.points)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{t.note || t.refType || '—'}</TableCell>
                              <TableCell className="text-sm">{formatDateTime(t.createdAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-3 text-center">لا توجد حركات ولاء</p>
                  )}
                </div>

                {detail && (
                  <div className="flex justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => { setDetail(null); openEdit(detail) }}>
                      <Pencil className="w-4 h-4" />
                      تعديل البيانات
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
