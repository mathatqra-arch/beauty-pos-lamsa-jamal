'use client'

import { useEffect, useState, useMemo } from 'react'
import { apiFetch, formatEGP, formatNumber, formatDateTime } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Plus, Search, Pencil, Truck, Download, RefreshCw, Phone, Mail, MapPin,
  FileText, Wallet, ShoppingBag, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'

interface SupplierFormState {
  name: string
  phone: string
  email: string
  address: string
  taxId: string
}

const EMPTY_FORM: SupplierFormState = {
  name: '', phone: '', email: '', address: '', taxId: '',
}

export function SuppliersModule() {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('limit', '500')
      const data = await apiFetch(`/suppliers?${params.toString()}`)
      setSuppliers(data || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 350)
    return () => clearTimeout(t)
  }, [search])

  const stats = useMemo(() => {
    const total = suppliers.length
    const totalDue = suppliers.reduce((s, sup) => s + (sup.purchaseSummary?.balance || sup.balance || 0), 0)
    const totalPurchases = suppliers.reduce((s, sup) => s + (sup.purchaseSummary?.totalPurchases || 0), 0)
    const avg = total > 0 ? totalPurchases / total : 0
    return { total, totalDue, totalPurchases, avg }
  }, [suppliers])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (s: any) => {
    setEditing(s)
    setForm({
      name: s.name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      taxId: s.taxId || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name) {
      toast.error('اسم المورد مطلوب')
      return
    }
    setSaving(true)
    try {
      const body: any = { ...form }
      if (editing) {
        await apiFetch(`/suppliers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('تم تحديث المورد')
      } else {
        await apiFetch('/suppliers', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('تم إنشاء المورد بنجاح')
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const openDetail = async (s: any) => {
    setDetailLoading(true)
    setDetail({ ...s, _loading: true })
    try {
      const full = await apiFetch(`/suppliers/${s.id}`)
      setDetail(full)
    } catch (e: any) {
      toast.error(e.message)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const exportCSV = () => {
    const headers = ['الاسم', 'الهاتف', 'البريد', 'العنوان', 'الرقم الضريبي', 'الرصيد', 'إجمالي المشتريات']
    const lines = [headers.join(',')]
    suppliers.forEach((s) => {
      const line = [
        `"${s.name || ''}"`,
        `"${s.phone || ''}"`,
        `"${s.email || ''}"`,
        `"${s.address || ''}"`,
        `"${s.taxId || ''}"`,
        s.purchaseSummary?.balance || s.balance || 0,
        s.purchaseSummary?.totalPurchases || 0,
      ]
      lines.push(line.join(','))
    })
    const csv = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`تم تصدير ${suppliers.length} مورد`)
  }

  const summaryCards = [
    { label: 'إجمالي الموردين', value: formatNumber(stats.total), icon: Truck, color: 'text-blue-600', bg: 'bg-blue-500/10' },
    { label: 'المستحق بالكامل', value: formatEGP(stats.totalDue), icon: Wallet, color: 'text-orange-600', bg: 'bg-orange-500/10' },
    { label: 'إجمالي المشتريات', value: formatEGP(stats.totalPurchases), icon: ShoppingBag, color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'متوسط الشراء', value: formatEGP(stats.avg), icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            الموردون
          </h1>
          <p className="text-muted-foreground text-sm">إدارة الموردين وفواتير الشراء</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={suppliers.length === 0}>
            <Download className="w-4 h-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4" />
            تحديث
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4" />
            إضافة مورد
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

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table / Cards */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : suppliers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا يوجد موردون</p>
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
                    <TableHead>العنوان</TableHead>
                    <TableHead>الرقم الضريبي</TableHead>
                    <TableHead className="text-center">الرصيد</TableHead>
                    <TableHead className="text-center">إجمالي المشتريات</TableHead>
                    <TableHead>آخر شراء</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => {
                    const balance = s.purchaseSummary?.balance || s.balance || 0
                    const totalPurchases = s.purchaseSummary?.totalPurchases || 0
                    const lastPurchase = s.purchases?.[0]?.createdAt || s.updatedAt
                    return (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(s)}
                      >
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground" dir="ltr">{s.phone || '—'}</TableCell>
                        <TableCell className="text-muted-foreground" dir="ltr">{s.email || '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.address || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{s.taxId || '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={
                            balance > 0
                              ? 'bg-orange-500/10 text-orange-700 border-orange-500/20 pos-number'
                              : 'bg-green-500/10 text-green-700 border-green-500/20 pos-number'
                          }>
                            {formatEGP(balance)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center pos-number">{formatEGP(totalPurchases)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {lastPurchase ? formatDateTime(lastPurchase) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
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
            {suppliers.map((s) => {
              const balance = s.purchaseSummary?.balance || s.balance || 0
              const totalPurchases = s.purchaseSummary?.totalPurchases || 0
              const lastPurchase = s.purchases?.[0]?.createdAt || s.updatedAt
              return (
                <Card key={s.id} onClick={() => openDetail(s)} className="cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{s.phone || '—'}</p>
                      </div>
                      <Badge variant="outline" className={
                        balance > 0
                          ? 'bg-orange-500/10 text-orange-700 border-orange-500/20 pos-number'
                          : 'bg-green-500/10 text-green-700 border-green-500/20 pos-number'
                      }>
                        {formatEGP(balance)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
                        <p className="font-bold text-sm pos-number">{formatEGP(totalPurchases)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">آخر شراء</p>
                        <p className="font-bold text-sm">{lastPurchase ? formatDateTime(lastPurchase) : '—'}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full mt-3" onClick={(e) => { e.stopPropagation(); openEdit(s) }}>
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
            <DialogTitle>{editing ? 'تعديل مورد' : 'إضافة مورد'}</DialogTitle>
            <DialogDescription>
              {editing ? 'تحديث بيانات المورد' : 'إنشاء مورد جديد'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="sname">الاسم *</Label>
              <Input
                id="sname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="اسم المورد"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="sphone">الهاتف</Label>
                <Input
                  id="sphone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="staxId">الرقم الضريبي</Label>
                <Input
                  id="staxId"
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  placeholder="xxx-xxx-xxx"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="semail">البريد الإلكتروني</Label>
              <Input
                id="semail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="supplier@example.com"
                dir="ltr"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="saddress">العنوان</Label>
              <Input
                id="saddress"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="العنوان"
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
              <Truck className="w-5 h-5" />
              {detail?.name || 'تفاصيل المورد'}
            </DialogTitle>
            <DialogDescription>ملف المورد وسجل المشتريات</DialogDescription>
          </DialogHeader>

          {detailLoading || detail?._loading ? (
            <div className="space-y-2 py-4">
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
                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">الرقم الضريبي</p>
                      <p className="text-sm font-mono" dir="ltr">{detail.taxId || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Balance info */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-center">
                    <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
                    <p className="text-lg font-bold pos-number text-green-700">
                      {formatEGP(detail.summary?.totalPurchases || 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
                    <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
                    <p className="text-lg font-bold pos-number text-blue-700">
                      {formatEGP(detail.summary?.totalPaid || 0)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20 text-center">
                    <p className="text-xs text-muted-foreground">الرصيد المستحق</p>
                    <p className="text-lg font-bold pos-number text-orange-700">
                      {formatEGP(detail.summary?.balance || detail.balance || 0)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Purchase history */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-blue-500" />
                    سجل المشتريات ({formatNumber(detail.purchases?.length || 0)})
                  </h3>
                  {detail.purchases && detail.purchases.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>رقم الفاتورة</TableHead>
                            <TableHead>التاريخ</TableHead>
                            <TableHead className="text-center">الأصناف</TableHead>
                            <TableHead className="text-center">الإجمالي</TableHead>
                            <TableHead className="text-center">المدفوع</TableHead>
                            <TableHead className="text-center">الحالة</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.purchases.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell>
                              <TableCell className="text-sm">{formatDateTime(p.createdAt)}</TableCell>
                              <TableCell className="text-center pos-number">{formatNumber(p.items?.length || 0)}</TableCell>
                              <TableCell className="text-center pos-number font-medium">{formatEGP(p.total)}</TableCell>
                              <TableCell className="text-center pos-number text-green-600">{formatEGP(p.paidAmount)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={
                                  p.status === 'PAID' ? 'bg-green-500/10 text-green-700 border-green-500/20' :
                                  p.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' :
                                  p.status === 'RECEIVED' ? 'bg-blue-500/10 text-blue-700 border-blue-500/20' :
                                  'bg-gray-500/10 text-gray-700 border-gray-500/20'
                                }>
                                  {p.status === 'PAID' ? 'مدفوعة' :
                                   p.status === 'PARTIAL' ? 'جزئية' :
                                   p.status === 'RECEIVED' ? 'مستلمة' :
                                   p.status === 'PENDING' ? 'قيد الانتظار' : p.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-3 text-center">لا توجد مشتريات</p>
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
