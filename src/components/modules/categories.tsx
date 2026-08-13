'use client'

import { Fragment, useEffect, useState, useMemo } from 'react'
import { apiFetch, formatNumber } from '@/lib/api'
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
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Plus, Pencil, Trash2, Folder, FolderOpen, ChevronDown, ChevronRight,
  Palette, Tag, AlertTriangle, Search, Package,
} from 'lucide-react'
import { toast } from 'sonner'

interface CategoryFormState {
  name: string
  nameAr: string
  color: string
  icon: string
  parentId: string
}

const EMPTY_FORM: CategoryFormState = {
  name: '', nameAr: '', color: '', icon: '', parentId: '',
}

// Preset color palette for beauty/cosmetics theme
const PRESET_COLORS = [
  { name: 'وردي', value: '#ec4899' },
  { name: 'أحمر وردي', value: '#e11d48' },
  { name: 'بنفسجي', value: '#a855f7' },
  { name: 'أرجواني', value: '#8b5cf6' },
  { name: 'أزرق', value: '#3b82f6' },
  { name: 'فيروزي', value: '#06b6d4' },
  { name: 'أخضر', value: '#10b981' },
  { name: 'أصفر', value: '#eab308' },
  { name: 'برتقالي', value: '#f97316' },
  { name: 'بني', value: '#92400e' },
  { name: 'رمادي', value: '#6b7280' },
  { name: 'أسود', value: '#1f2937' },
]

export function CategoriesModule() {
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletePreview, setDeletePreview] = useState<any>(null)

  const loadCategories = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/categories')
      setCategories(data || [])
    } catch (e: any) {
      setError(e.message)
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  // Build hierarchical structure
  const hierarchy = useMemo(() => {
    const roots = categories.filter((c) => !c.parentId)
    return roots.map((root) => ({
      ...root,
      subcategories: categories.filter((c) => c.parentId === root.id),
    }))
  }, [categories])

  // Filter by search
  const filteredHierarchy = useMemo(() => {
    if (!search.trim()) return hierarchy
    const q = search.trim().toLowerCase()
    const matches = (c: any) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.nameAr || '').toLowerCase().includes(q)
    return hierarchy
      .map((root) => {
        const rootMatches = matches(root)
        const matchedSubs = root.subcategories.filter((s: any) => matches(s))
        if (rootMatches || matchedSubs.length > 0) {
          return { ...root, subcategories: rootMatches ? root.subcategories : matchedSubs }
        }
        return null
      })
      .filter(Boolean) as any[]
  }, [hierarchy, search])

  const toggleCollapse = (id: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stats = useMemo(() => {
    const totalRoots = categories.filter((c) => !c.parentId).length
    const totalSubs = categories.filter((c) => !!c.parentId).length
    const totalProducts = categories.reduce((sum, c) => sum + (c.productCount || 0), 0)
    return { totalRoots, totalSubs, total: categories.length, totalProducts }
  }, [categories])

  // Root categories only (for parent select in form) — excludes self and descendants when editing
  const availableParents = useMemo(() => {
    if (!editing) return categories.filter((c) => !c.parentId)
    // Exclude self when editing
    return categories.filter((c) => !c.parentId && c.id !== editing.id)
  }, [categories, editing])

  const openAdd = (presetParentId?: string) => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, parentId: presetParentId || '' })
    setDialogOpen(true)
  }

  const openAddSub = (parent: any) => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, parentId: parent.id })
    setDialogOpen(true)
  }

  const openEdit = (c: any) => {
    setEditing(c)
    setForm({
      name: c.name || '',
      nameAr: c.nameAr || '',
      color: c.color || '',
      icon: c.icon || '',
      parentId: c.parentId || '',
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('اسم الفئة مطلوب')
      return
    }
    setSaving(true)
    try {
      const body: any = {
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        parentId: form.parentId === 'none' || !form.parentId ? null : form.parentId,
        color: form.color || null,
        icon: form.icon.trim() || null,
      }
      if (editing) {
        await apiFetch(`/categories/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        toast.success('تم تحديث الفئة')
      } else {
        await apiFetch('/categories', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        toast.success('تم إنشاء الفئة بنجاح')
      }
      setDialogOpen(false)
      loadCategories()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const openDelete = async (c: any) => {
    setDeleteTarget(c)
    setDeletePreview(null)
    setDeleting(true)
    try {
      // Fetch fresh details to confirm product/child counts server-side
      const detail = await apiFetch(`/categories/${c.id}`)
      setDeletePreview(detail)
    } catch {
      // fall back to whatever we already have
      setDeletePreview(c)
    } finally {
      setDeleting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/categories/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('تم حذف الفئة بنجاح')
      setDeleteTarget(null)
      setDeletePreview(null)
      loadCategories()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const renderColorDot = (color?: string | null, size = 'w-3 h-3') => {
    if (!color) {
      return <span className={`${size} rounded-full bg-muted border`} />
    }
    return (
      <span
        className={`${size} rounded-full inline-block border border-black/10`}
        style={{ backgroundColor: color }}
      />
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-primary" />
            الفئات والفئات الفرعية
          </h1>
          <p className="text-muted-foreground text-sm">تنظيم المنتجات في فئات رئيسية وفرعية</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openAdd()} size="sm">
            <Plus className="w-4 h-4" />
            إضافة فئة
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي الفئات</p>
            <p className="text-xl font-bold mt-1">{formatNumber(stats.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">فئات رئيسية</p>
            <p className="text-xl font-bold mt-1 text-primary">{formatNumber(stats.totalRoots)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">فئات فرعية</p>
            <p className="text-xl font-bold mt-1 text-purple-600">{formatNumber(stats.totalSubs)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">منتجات مصنفة</p>
            <p className="text-xl font-bold mt-1 text-green-600">{formatNumber(stats.totalProducts)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث في الفئات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading / Error / Empty / Tree */}
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
            <Button variant="outline" onClick={loadCategories}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      ) : filteredHierarchy.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">
              {search ? 'لا توجد فئات مطابقة' : 'لا توجد فئات بعد'}
            </p>
            <Button onClick={() => openAdd()}>
              <Plus className="w-4 h-4" />
              إضافة أول فئة
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Desktop tree table */}
            <div className="hidden md:block">
              <ScrollArea className="h-[calc(100vh-400px)] min-h-[400px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[40%]">اسم الفئة</TableHead>
                      <TableHead>الاسم (إنجليزي)</TableHead>
                      <TableHead className="text-center">اللون</TableHead>
                      <TableHead className="text-center">عدد المنتجات</TableHead>
                      <TableHead className="text-center">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHierarchy.map((parent) => {
                      const isCollapsed = collapsedParents.has(parent.id)
                      const hasSubs = parent.subcategories.length > 0
                      return (
                        <Fragment key={parent.id}>
                          <TableRow className="bg-muted/30 hover:bg-muted/50">
                            <TableCell className="font-bold">
                              <div className="flex items-center gap-2">
                                {hasSubs ? (
                                  <button
                                    onClick={() => toggleCollapse(parent.id)}
                                    className="p-0.5 rounded hover:bg-muted"
                                    title={isCollapsed ? 'توسيع' : 'طي'}
                                  >
                                    {isCollapsed ? (
                                      <ChevronRight className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="w-5 inline-block" />
                                )}
                                <FolderOpen className="w-4 h-4 text-primary" />
                                <span>{parent.nameAr || parent.name}</span>
                                {hasSubs && (
                                  <Badge variant="outline" className="text-xs">
                                    {parent.subcategories.length}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{parent.name}</TableCell>
                            <TableCell className="text-center">
                              {renderColorDot(parent.color, 'w-4 h-4')}
                            </TableCell>
                            <TableCell className="text-center font-bold pos-number">
                              {formatNumber(parent.productCount || 0)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => openAddSub(parent)}
                                  title="إضافة فئة فرعية"
                                >
                                  <Plus className="w-4 h-4 text-primary" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => openEdit(parent)}
                                  title="تعديل"
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-600 hover:text-red-700"
                                  onClick={() => openDelete(parent)}
                                  title="حذف"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {!isCollapsed && parent.subcategories.map((sub: any) => (
                            <TableRow key={sub.id} className="hover:bg-muted/30">
                              <TableCell className="font-medium pr-12">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">—</span>
                                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span>{sub.nameAr || sub.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{sub.name}</TableCell>
                              <TableCell className="text-center">
                                {renderColorDot(sub.color, 'w-4 h-4')}
                              </TableCell>
                              <TableCell className="text-center font-bold pos-number">
                                {formatNumber(sub.productCount || 0)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => openEdit(sub)}
                                    title="تعديل"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-red-600 hover:text-red-700"
                                    onClick={() => openDelete(sub)}
                                    title="حذف"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* Mobile tree list */}
            <div className="md:hidden divide-y">
              {filteredHierarchy.map((parent) => {
                const isCollapsed = collapsedParents.has(parent.id)
                const hasSubs = parent.subcategories.length > 0
                return (
                  <div key={parent.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {hasSubs ? (
                          <button
                            onClick={() => toggleCollapse(parent.id)}
                            className="p-1 -m-1 rounded hover:bg-muted shrink-0"
                            title={isCollapsed ? 'توسيع' : 'طي'}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        ) : null}
                        <FolderOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {renderColorDot(parent.color)}
                            <p className="font-bold truncate">{parent.nameAr || parent.name}</p>
                            {hasSubs && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                {parent.subcategories.length}
                              </Badge>
                            )}
                          </div>
                          {parent.name && parent.name !== (parent.nameAr || parent.name) && (
                            <p className="text-xs text-muted-foreground mt-0.5">{parent.name}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs">
                            <span className="text-muted-foreground">
                              المنتجات: <span className="font-bold pos-number">{formatNumber(parent.productCount || 0)}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => openAddSub(parent)}>
                        <Plus className="w-3.5 h-3.5" />
                        فئة فرعية
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(parent)}>
                        <Pencil className="w-3.5 h-3.5" />
                        تعديل
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => openDelete(parent)}>
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف
                      </Button>
                    </div>
                    {!isCollapsed && hasSubs && (
                      <div className="mt-3 space-y-2 border-r-2 border-muted pr-3">
                        {parent.subcategories.map((sub: any) => (
                          <div key={sub.id} className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <Tag className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {renderColorDot(sub.color)}
                                  <p className="font-medium truncate text-sm">{sub.nameAr || sub.name}</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  المنتجات: <span className="font-bold pos-number">{formatNumber(sub.productCount || 0)}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(sub)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => openDelete(sub)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              {editing ? 'تعديل الفئة' : 'إضافة فئة جديدة'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `تعديل بيانات: ${editing.nameAr || editing.name}`
                : form.parentId
                  ? 'سيتم إنشاؤها كفئة فرعية'
                  : 'سيتم إنشاؤها كفئة رئيسية'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الاسم (إنجليزي) *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Skincare"
                />
              </div>
              <div className="space-y-1.5">
                <Label>الاسم (عربي)</Label>
                <Input
                  value={form.nameAr}
                  onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                  placeholder="العناية بالبشرة"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>الفئة الأب (اتركه فارغاً لفئة رئيسية)</Label>
              <Select
                value={form.parentId}
                onValueChange={(v) => setForm({ ...form, parentId: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="— بدون (فئة رئيسية) —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون (فئة رئيسية) —</SelectItem>
                  {availableParents.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameAr || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Color picker */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Palette className="w-4 h-4" />
                اللون
              </Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm({ ...form, color: c.value })}
                    title={c.name}
                    className={`w-8 h-8 rounded-full border-2 transition ${
                      form.color === c.value ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
                {/* Custom color via native input */}
                <label
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-pointer transition ${
                    form.color && !PRESET_COLORS.find((p) => p.value === form.color)
                      ? 'border-foreground scale-110'
                      : 'border-dashed border-muted-foreground hover:scale-105'
                  }`}
                  title="لون مخصص"
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="color"
                    className="opacity-0 absolute w-0 h-0"
                    value={form.color || '#ec4899'}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  />
                </label>
                {form.color && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setForm({ ...form, color: '' })}
                  >
                    إزالة اللون
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>الأيقونة (اختياري)</Label>
              <Input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="emoji أو نص قصير (مثل: 💄)"
              />
            </div>

            {/* Preview */}
            <div className="rounded-md border p-3 bg-muted/30 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">معاينة:</span>
              <Badge
                variant="outline"
                className="gap-1.5"
                style={form.color ? { borderColor: form.color, color: form.color } : undefined}
              >
                {form.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: form.color }}
                  />
                )}
                {form.icon && <span>{form.icon}</span>}
                {form.nameAr || form.name || 'اسم الفئة'}
              </Badge>
              {form.parentId && (
                <span className="text-xs text-muted-foreground">
                  ← {categories.find((c) => c.id === form.parentId)?.nameAr || categories.find((c) => c.id === form.parentId)?.name || ''}
                </span>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : editing ? 'حفظ التعديلات' : 'إضافة الفئة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف الفئة &quot;{deleteTarget?.nameAr || deleteTarget?.name}&quot;؟
            </DialogDescription>
          </DialogHeader>

          {deletePreview && (
            <div className="space-y-2">
              {(deletePreview.children?.length || deletePreview.subcategories?.length || 0) > 0 ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm">
                  <p className="font-semibold text-red-700 mb-1">⚠️ لا يمكن الحذف</p>
                  <p className="text-red-600 text-xs">
                    تحتوي هذه الفئة على {(deletePreview.children?.length || deletePreview.subcategories?.length || 0)} فئة فرعية.
                    احذف الفئات الفرعية أولاً.
                  </p>
                </div>
              ) : (deletePreview.productCount || deletePreview.products?.length || 0) > 0 ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm">
                  <p className="font-semibold text-red-700 mb-1">⚠️ لا يمكن الحذف</p>
                  <p className="text-red-600 text-xs">
                    تحتوي هذه الفئة على {formatNumber(deletePreview.productCount || deletePreview.products?.length || 0)} منتج.
                    انقل المنتجات إلى فئة أخرى قبل الحذف.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    لا توجد منتجات أو فئات فرعية مرتبطة. يمكن الحذف بأمان.
                  </p>
                </div>
              )}
            </div>
          )}

          {!deletePreview && deleting && (
            <div className="text-center text-sm text-muted-foreground py-2">جاري التحقق...</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeletePreview(null) }}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting || (deletePreview ? ((deletePreview.children?.length || deletePreview.subcategories?.length || 0) > 0 || (deletePreview.productCount || deletePreview.products?.length || 0) > 0) : false)}
            >
              {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
