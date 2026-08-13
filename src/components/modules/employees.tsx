'use client'

import { useEffect, useState } from 'react'
import { apiFetch, formatDateTime } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { UserPlus, Users, Edit, Trash2, Shield, CheckCircle, XCircle, Lock, Mail, Phone } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدير',
  MANAGER: 'مشرف',
  CASHIER: 'كاشير',
  WAREHOUSE: 'أمين مخزن',
  ACCOUNTANT: 'محاسب',
  PLATFORM_ADMIN: 'مدير المنصة',
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  MANAGER: 'bg-blue-100 text-blue-700 border-blue-200',
  CASHIER: 'bg-green-100 text-green-700 border-green-200',
  WAREHOUSE: 'bg-amber-100 text-amber-700 border-amber-200',
  ACCOUNTANT: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  PLATFORM_ADMIN: 'bg-red-100 text-red-700 border-red-200',
}

export function EmployeesModule() {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editUser, setEditUser] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('CASHIER')
  const [pin, setPin] = useState('')
  const [active, setActive] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/users')
      setUsers(data || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditUser(null)
    setName('')
    setUsername('')
    setEmail('')
    setPassword('')
    setPhone('')
    setRole('CASHIER')
    setPin('')
    setActive(true)
    setDialogOpen(true)
  }

  const openEdit = (u: any) => {
    setEditUser(u)
    setName(u.name)
    setUsername(u.username)
    setEmail(u.email || '')
    setPassword('')
    setPhone(u.phone || '')
    setRole(u.role)
    setPin(u.pin || '')
    setActive(u.active !== false)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data: any = { name, username, email, phone, role, pin, active }
      if (password) data.password = password

      if (editUser) {
        await apiFetch(`/users/${editUser.id}`, { method: 'PUT', body: JSON.stringify(data) })
        toast.success('تم تحديث الموظف')
      } else {
        if (!password) {
          toast.error('كلمة المرور مطلوبة')
          setSaving(false)
          return
        }
        await apiFetch('/users', { method: 'POST', body: JSON.stringify(data) })
        toast.success('تم إنشاء الموظف')
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (u: any) => {
    if (!confirm(`تعطيل الموظف "${u.name}"؟`)) return
    try {
      await apiFetch(`/users/${u.id}`, { method: 'DELETE' })
      toast.success('تم تعطيل الموظف')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // Only ADMIN can access
  if (user?.role !== 'ADMIN' && user?.role !== 'PLATFORM_ADMIN') {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">صلاحية المدير مطلوبة للوصول لهذه الصفحة</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const activeCount = users.filter(u => u.active !== false).length
  const adminCount = users.filter(u => u.role === 'ADMIN').length

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            إدارة الموظفين
          </h1>
          <p className="text-muted-foreground text-sm">إضافة وتعديل وتعطيل حسابات الموظفين</p>
        </div>
        <Button onClick={openAdd}>
          <UserPlus className="w-4 h-4 ml-1" />
          إضافة موظف
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي الموظفين</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">نشط</p>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">مديرون</p>
            <p className="text-2xl font-bold text-purple-600">{adminCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">معطل</p>
            <p className="text-2xl font-bold text-red-600">{users.length - activeCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">قائمة الموظفين</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${u.active === false ? 'opacity-50 bg-muted/20' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                      {u.name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{u.name}</p>
                        {u.id === user?.id && (
                          <Badge variant="secondary" className="text-[10px]">أنت</Badge>
                        )}
                        {u.active === false && (
                          <Badge variant="destructive" className="text-[10px]">معطل</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>@{u.username}</span>
                        {u.phone && <span>{u.phone}</span>}
                      </div>
                    </div>
                    <Badge className={`shrink-0 ${ROLE_COLORS[u.role] || ''}`} variant="outline">
                      <Shield className="w-3 h-3 ml-1" />
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEdit(u)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {u.id !== user?.id && u.active !== false && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeactivate(u)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {users.length === 0 && !loading && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>لا يوجد موظفون</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? 'تعديل موظف' : 'إضافة موظف جديد'}</DialogTitle>
            {!editUser && (
              <DialogDescription>
                سيتم إنشاء حساب جديد يمكنه تسجيل الدخول للنظام
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الاسم الكامل *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد محمد" />
              </div>
              <div className="space-y-1.5">
                <Label>اسم المستخدم *</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ahmed" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pr-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ahmed@beauty.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>الهاتف</Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pr-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01000000000" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{editUser ? 'كلمة مرور جديدة' : 'كلمة المرور *'}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editUser ? 'اتركها فارغة للإبقاء' : '6 أحرف على الأقل'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>رمز PIN (اختياري)</Label>
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').substring(0, 4))}
                  placeholder="0000"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>الدور *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">مدير (صلاحيات كاملة)</SelectItem>
                  <SelectItem value="MANAGER">مشرف</SelectItem>
                  <SelectItem value="CASHIER">كاشير</SelectItem>
                  <SelectItem value="WAREHOUSE">أمين مخزن</SelectItem>
                  <SelectItem value="ACCOUNTANT">محاسب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <Label>الحساب نشط</Label>
                <p className="text-xs text-muted-foreground">الموظفون المعطلون لا يمكنهم تسجيل الدخول</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name || !username || (!editUser && !password)}
            >
              {saving ? 'جاري الحفظ...' : editUser ? 'حفظ التعديلات' : 'إنشاء الموظف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
