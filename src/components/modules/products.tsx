'use client'

import { Fragment, useEffect, useState, useMemo, useRef } from 'react'
import { apiFetch, formatEGP, formatNumber } from '@/lib/api'
import { QRCodeDialog, BulkQRDialog } from '@/components/pos/qr-code-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import {
  Plus, Search, Pencil, Trash2, Download, Upload, Package, Filter, Image as ImageIcon, X, AlertTriangle,
  QrCode, Tag,
} from 'lucide-react'
import { toast } from 'sonner'

interface ProductFormState {
  name: string
  nameAr: string
  sku: string
  barcode: string
  categoryId: string
  brandId: string
  unitId: string
  supplierId: string
  purchaseCost: string
  sellingPrice: string
  wholesalePrice: string
  taxRate: string
  minStock: string
  reorderLevel: string
  openingStock: string
  image: string
  description: string
  active: boolean
}

const EMPTY_FORM: ProductFormState = {
  name: '', nameAr: '', sku: '', barcode: '',
  categoryId: '', brandId: '', unitId: '', supplierId: '',
  purchaseCost: '0', sellingPrice: '0', wholesalePrice: '0', taxRate: '14',
  minStock: '0', reorderLevel: '5', openingStock: '0',
  image: '', description: '', active: true,
}

export function ProductsModule() {
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [brands] = useState<any[]>([])
  const [units] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importPreview, setImportPreview] = useState<any[] | null>(null)
  const [qrProduct, setQrProduct] = useState<any>(null)
  const [bulkQrOpen, setBulkQrOpen] = useState(false)
  const [quickPriceProduct, setQuickPriceProduct] = useState<any>(null)
  const [quickPriceValue, setQuickPriceValue] = useState('')
  const [quickPriceSaving, setQuickPriceSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProducts = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter)
      if (activeFilter !== 'all') params.set('active', activeFilter)
      params.set('limit', '500')
      const data = await apiFetch(`/products?${params.toString()}`)
      setProducts(data || [])
    } catch (e: any) {
      setError(e.message)
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadMeta = async () => {
    try {
      const [cats, sups] = await Promise.all([
        apiFetch('/categories'),
        apiFetch('/suppliers'),
      ])
      setCategories(cats || [])
      setSuppliers(sups || [])
    } catch (e: any) {
      // non-fatal
      console.warn('meta load failed', e)
    }
  }

  useEffect(() => {
    loadProducts()
    loadMeta()
  }, [])

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => loadProducts(), 350)
    return () => clearTimeout(t)
  }, [search, categoryFilter, activeFilter])

  const filtered = useMemo(() => products, [products])

  // Hierarchical categories: parent rows with nested subcategories
  const categoryHierarchy = useMemo(() => {
    const roots = categories.filter((c) => !c.parentId)
    return roots.map((root) => ({
      ...root,
      subcategories: categories.filter((c) => c.parentId === root.id),
    }))
  }, [categories])

  const openQuickPrice = (p: any) => {
    setQuickPriceProduct(p)
    setQuickPriceValue(String(p.sellingPrice ?? 0))
  }

  const saveQuickPrice = async () => {
    if (!quickPriceProduct) return
    const newPrice = parseFloat(quickPriceValue)
    if (isNaN(newPrice) || newPrice < 0) {
      toast.error('السعر غير صالح')
      return
    }
    setQuickPriceSaving(true)
    try {
      await apiFetch(`/products/${quickPriceProduct.id}`, {
        method: 'PUT',
        body: JSON.stringify({ sellingPrice: newPrice }),
      })
      toast.success('تم تحديث السعر')
      setQuickPriceProduct(null)
      loadProducts()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setQuickPriceSaving(false)
    }
  }

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (p: any) => {
    setEditing(p)
    setForm({
      name: p.name || '',
      nameAr: p.nameAr || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      categoryId: p.categoryId || '',
      brandId: p.brandId || '',
      unitId: p.unitId || '',
      supplierId: p.supplierId || '',
      purchaseCost: String(p.purchaseCost ?? 0),
      sellingPrice: String(p.sellingPrice ?? 0),
      wholesalePrice: String(p.wholesalePrice ?? 0),
      taxRate: String(p.taxRate ?? 0),
      minStock: String(p.minStock ?? 0),
      reorderLevel: String(p.reorderLevel ?? 0),
      openingStock: '0',
      image: p.image || '',
      description: p.description || '',
      active: p.active ?? true,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.sku) {
      toast.error('الاسم ورمز SKU مطلوبان')
      return
    }
    setSaving(true)
    try {
      const body: any = { ...form }
      // Clean empty strings -> null for foreign keys
      ;['categoryId', 'brandId', 'unitId', 'supplierId'].forEach((k) => {
        if (!body[k]) body[k] = null
      })
      if (editing) {
        delete body.openingStock
        await apiFetch(`/products/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('تم تحديث المنتج')
      } else {
        await apiFetch('/products', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('تم إنشاء المنتج بنجاح')
      }
      setDialogOpen(false)
      loadProducts()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (p: any) => {
    if (!confirm(`هل أنت متأكد من أرشفة المنتج "${p.nameAr || p.name}"؟`)) return
    try {
      await apiFetch(`/products/${p.id}`, { method: 'DELETE' })
      toast.success('تم أرشفة المنتج')
      loadProducts()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const exportCSV = () => {
    const rows: any[] = filtered
    const headers = ['الاسم', 'الاسم عربي', 'SKU', 'الباركود', 'الفئة', 'سعر الشراء', 'سعر البيع', 'الجملة', 'الضريبة %', 'المخزون', 'الحد الأدنى', 'حد إعادة الطلب', 'الحالة']
    const lines = [headers.join(',')]
    rows.forEach((p) => {
      const stock = p.currentStock ?? 0
      const cat = p.category ? (p.category.nameAr || p.category.name) : ''
      const line = [
        `"${p.name || ''}"`,
        `"${p.nameAr || ''}"`,
        `"${p.sku || ''}"`,
        `"${p.barcode || ''}"`,
        `"${cat}"`,
        p.purchaseCost ?? 0,
        p.sellingPrice ?? 0,
        p.wholesalePrice ?? 0,
        p.taxRate ?? 0,
        stock,
        p.minStock ?? 0,
        p.reorderLevel ?? 0,
        p.active ? 'نشط' : 'مؤرشف',
      ]
      lines.push(line.join(','))
    })
    const csv = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`تم تصدير ${rows.length} منتج`)
  }

  const handleImportClick = () => fileInputRef.current?.click()

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) {
        toast.error('الملف فارغ أو غير صالح')
        return
      }
      // Skip header
      const parsed = lines.slice(1).map((line) => {
        // simple CSV parser handling quoted strings
        const cells: string[] = []
        let cur = ''
        let inQ = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') inQ = !inQ
          else if (ch === ',' && !inQ) { cells.push(cur); cur = '' }
          else cur += ch
        }
        cells.push(cur)
        return cells
      }).map((c) => ({
        name: c[0] || '',
        nameAr: c[1] || '',
        sku: c[2] || '',
        barcode: c[3] || '',
        category: c[4] || '',
        purchaseCost: c[5] || '0',
        sellingPrice: c[6] || '0',
        wholesalePrice: c[7] || '0',
        taxRate: c[8] || '0',
        stock: c[9] || '0',
      }))
      setImportPreview(parsed)
      toast.success(`تم تحميل ${parsed.length} سجل`)
    } catch (err: any) {
      toast.error('فشل قراءة الملف: ' + err.message)
    } finally {
      // reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!importPreview) return
    let ok = 0
    let fail = 0
    for (const row of importPreview) {
      try {
        await apiFetch('/products', {
          method: 'POST',
          body: JSON.stringify({
            name: row.name,
            nameAr: row.nameAr,
            sku: row.sku || `SKU-${Date.now()}-${ok}`,
            barcode: row.barcode || undefined,
            purchaseCost: row.purchaseCost,
            sellingPrice: row.sellingPrice,
            wholesalePrice: row.wholesalePrice,
            taxRate: row.taxRate,
            openingStock: row.stock,
            active: true,
          }),
        })
        ok++
      } catch {
        fail++
      }
    }
    toast.success(`تم استيراد ${ok} منتج${fail ? `, فشل ${fail}` : ''}`)
    setImportPreview(null)
    loadProducts()
  }

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length
    const active = filtered.filter((p) => p.active).length
    const lowStock = filtered.filter((p) => {
      const s = p.currentStock ?? 0
      return s <= (p.reorderLevel ?? 0) && s > 0
    }).length
    const outOfStock = filtered.filter((p) => (p.currentStock ?? 0) <= 0).length
    return { total, active, lowStock, outOfStock }
  }, [filtered])

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            المنتجات
          </h1>
          <p className="text-muted-foreground text-sm">إدارة المنتجات والأسعار والمخزون</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" size="sm" onClick={handleImportClick}>
            <Upload className="w-4 h-4" />
            استيراد CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            تصدير CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkQrOpen(true)}
            disabled={filtered.length === 0}
            title="طباعة QR Code لجميع المنتجات المعروضة"
          >
            <QrCode className="w-4 h-4" />
            طباعة QR للكل
          </Button>
          <Button onClick={openAdd} size="sm">
            <Plus className="w-4 h-4" />
            إضافة منتج
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي المنتجات</p>
            <p className="text-xl font-bold mt-1">{formatNumber(stats.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">نشط</p>
            <p className="text-xl font-bold mt-1 text-green-600">{formatNumber(stats.active)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">مخزون منخفض</p>
            <p className="text-xl font-bold mt-1 text-orange-600">{formatNumber(stats.lowStock)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">نفد المخزون</p>
            <p className="text-xl font-bold mt-1 text-red-600">{formatNumber(stats.outOfStock)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو SKU أو الباركود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-64">
                <Filter className="w-4 h-4 ml-1 text-muted-foreground" />
                <SelectValue placeholder="كل الفئات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {categoryHierarchy.map((parent) => (
                  <Fragment key={parent.id}>
                    <SelectItem value={parent.id}>
                      {parent.nameAr || parent.name}
                    </SelectItem>
                    {parent.subcategories.map((child: any) => (
                      <SelectItem key={child.id} value={child.id}>
                        — {child.nameAr || child.name}
                      </SelectItem>
                    ))}
                  </Fragment>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="true">نشط</SelectItem>
                <SelectItem value="false">مؤرشف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading / Error / Empty / Table */}
      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 mb-3">{error}</p>
            <Button variant="outline" onClick={loadProducts}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">لا توجد منتجات مطابقة</p>
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4" />
              إضافة أول منتج
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden md:block">
              <ScrollArea className="h-[calc(100vh-380px)] min-h-[400px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-14 text-center">الصورة</TableHead>
                      <TableHead>الاسم</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>الفئة</TableHead>
                      <TableHead className="text-left">السعر</TableHead>
                      <TableHead className="text-left">التكلفة</TableHead>
                      <TableHead className="text-center">المخزون</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const stock = p.currentStock ?? 0
                      const stockColor = stock <= 0 ? 'text-red-600' : stock <= (p.reorderLevel ?? 0) ? 'text-orange-600' : 'text-green-600'
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            {p.image ? (
                              <img src={p.image} alt="" className="w-10 h-10 rounded object-cover border" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>{p.nameAr || p.name}</div>
                            {p.nameAr && p.name && (
                              <div className="text-xs text-muted-foreground">{p.name}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{p.barcode || '—'}</TableCell>
                          <TableCell className="text-sm font-mono">{p.sku}</TableCell>
                          <TableCell>
                            {p.category ? (
                              <Badge variant="outline">{p.category.nameAr || p.category.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-left font-medium pos-number">{formatEGP(p.sellingPrice)}</TableCell>
                          <TableCell className="text-left text-sm text-muted-foreground pos-number">{formatEGP(p.purchaseCost)}</TableCell>
                          <TableCell className={`text-center font-bold pos-number ${stockColor}`}>{formatNumber(stock)}</TableCell>
                          <TableCell className="text-center">
                            {p.active ? (
                              <Badge className="bg-green-500/10 text-green-700 border-green-500/20">نشط</Badge>
                            ) : (
                              <Badge className="bg-gray-500/10 text-gray-700 border-gray-500/20">مؤرشف</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openQuickPrice(p)}
                                title="تغيير السعر"
                              >
                                <Tag className="w-4 h-4 text-primary" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setQrProduct(p)}
                                title="QR Code"
                              >
                                <QrCode className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => handleArchive(p)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {filtered.map((p) => {
                const stock = p.currentStock ?? 0
                const stockColor = stock <= 0 ? 'text-red-600' : stock <= (p.reorderLevel ?? 0) ? 'text-orange-600' : 'text-green-600'
                return (
                  <div key={p.id} className="p-4 flex gap-3">
                    {p.image ? (
                      <img src={p.image} alt="" className="w-14 h-14 rounded object-cover border shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium truncate">{p.nameAr || p.name}</p>
                        <Badge variant="outline" className="shrink-0">{formatEGP(p.sellingPrice)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span>المخزون: <span className={`font-bold ${stockColor}`}>{formatNumber(stock)}</span></span>
                        {p.category && <span className="text-muted-foreground">{p.category.nameAr || p.category.name}</span>}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                          <Pencil className="w-3.5 h-3.5" />
                          تعديل
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openQuickPrice(p)}>
                          <Tag className="w-3.5 h-3.5 text-primary" />
                          تغيير السعر
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setQrProduct(p)}>
                          <QrCode className="w-3.5 h-3.5" />
                          QR
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleArchive(p)}>
                          <Trash2 className="w-3.5 h-3.5" />
                          أرشفة
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل المنتج' : 'إضافة منتج جديد'}</DialogTitle>
            <DialogDescription>
              {editing ? `تعديل بيانات: ${editing.nameAr || editing.name}` : 'أدخل بيانات المنتج الجديد'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Basic info */}
            <div className="space-y-1.5">
              <Label>الاسم (إنجليزي) *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product Name" />
            </div>
            <div className="space-y-1.5">
              <Label>الاسم (عربي)</Label>
              <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="اسم المنتج" />
            </div>
            <div className="space-y-1.5">
              <Label>SKU *</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="P-001" />
            </div>
            <div className="space-y-1.5">
              <Label>الباركود</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="622..." />
            </div>

            <div className="space-y-1.5">
              <Label>الفئة</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
                <SelectContent>
                  {categoryHierarchy.map((parent) => (
                    <Fragment key={parent.id}>
                      <SelectItem value={parent.id}>{parent.nameAr || parent.name}</SelectItem>
                      {parent.subcategories.map((child: any) => (
                        <SelectItem key={child.id} value={child.id}>
                          — {child.nameAr || child.name}
                        </SelectItem>
                      ))}
                    </Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>المورد</Label>
              <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>الماركة</Label>
              <Select value={form.brandId} onValueChange={(v) => setForm({ ...form, brandId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.nameAr || b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>الوحدة</Label>
              <Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Pricing */}
          <div>
            <p className="text-sm font-semibold mb-3">التسعير</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">سعر الشراء</Label>
                <Input type="number" step="0.01" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">سعر البيع</Label>
                <Input type="number" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">سعر الجملة</Label>
                <Input type="number" step="0.01" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">الضريبة %</Label>
                <Input type="number" step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Inventory */}
          <div>
            <p className="text-sm font-semibold mb-3">المخزون</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">الحد الأدنى</Label>
                <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">حد إعادة الطلب</Label>
                <Input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{editing ? 'المخزون الافتتاحي' : 'المخزون الافتتاحي *'}</Label>
                <Input
                  type="number"
                  value={form.openingStock}
                  onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                  disabled={!!editing}
                  placeholder={editing ? 'استخدم تسوية المخزون' : '0'}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Other */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>رابط الصورة</Label>
              <Input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>الوصف</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="وصف المنتج..." />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="active-switch" className="cursor-pointer">المنتج نشط</Label>
                <p className="text-xs text-muted-foreground">المنتجات المؤرشفة لا تظهر في نقطة البيع</p>
              </div>
              <Switch id="active-switch" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : editing ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={!!importPreview} onOpenChange={(o) => !o && setImportPreview(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>معاينة الاستيراد</DialogTitle>
            <DialogDescription>
              تم تحليل {importPreview?.length || 0} سجل. سيتم إنشاء منتجات جديدة.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>الباركود</TableHead>
                  <TableHead className="text-left">السعر</TableHead>
                  <TableHead className="text-center">المخزون</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importPreview?.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.nameAr || r.name || `—`}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sku || '—'}</TableCell>
                    <TableCell className="text-xs">{r.barcode || '—'}</TableCell>
                    <TableCell className="text-left pos-number">{formatEGP(parseFloat(r.sellingPrice) || 0)}</TableCell>
                    <TableCell className="text-center">{r.stock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)}>
              <X className="w-4 h-4" />
              إلغاء
            </Button>
            <Button onClick={confirmImport}>
              <Upload className="w-4 h-4" />
              تأكيد الاستيراد ({importPreview?.length || 0})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog (single product) */}
      <QRCodeDialog
        open={!!qrProduct}
        onOpenChange={(o) => !o && setQrProduct(null)}
        product={qrProduct}
      />

      {/* Bulk QR Dialog (all filtered products) */}
      <BulkQRDialog
        open={bulkQrOpen}
        onOpenChange={setBulkQrOpen}
        products={filtered}
      />

      {/* Quick Price Edit Dialog */}
      <Dialog open={!!quickPriceProduct} onOpenChange={(o) => !o && setQuickPriceProduct(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              تغيير السعر السريع
            </DialogTitle>
            <DialogDescription>
              {quickPriceProduct?.nameAr || quickPriceProduct?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <span className="text-sm text-muted-foreground">السعر الحالي</span>
              <span className="font-bold pos-number">{formatEGP(quickPriceProduct?.sellingPrice ?? 0)}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-price">السعر الجديد</Label>
              <Input
                id="quick-price"
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={quickPriceValue}
                onChange={(e) => setQuickPriceValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveQuickPrice()
                }}
              />
            </div>
            {quickPriceProduct && !isNaN(parseFloat(quickPriceValue)) && (
              <p className="text-xs text-muted-foreground text-center">
                الفرق:{' '}
                <span className={`font-bold pos-number ${parseFloat(quickPriceValue) >= (quickPriceProduct.sellingPrice ?? 0) ? 'text-green-600' : 'text-red-600'}`}>
                  {formatEGP(parseFloat(quickPriceValue) - (quickPriceProduct.sellingPrice ?? 0))}
                </span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickPriceProduct(null)}>
              إلغاء
            </Button>
            <Button onClick={saveQuickPrice} disabled={quickPriceSaving}>
              {quickPriceSaving ? 'جاري الحفظ...' : 'حفظ السعر'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
