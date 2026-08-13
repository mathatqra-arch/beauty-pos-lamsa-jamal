'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch, formatEGP, formatDateTime } from '@/lib/api'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  Wallet, Lock, Unlock, ArrowDownToLine, ArrowUpFromLine, RefreshCw,
  AlertTriangle, Coins, TrendingUp, TrendingDown, Receipt, PiggyBank, Scale,
} from 'lucide-react'
import { toast } from 'sonner'

const MOVEMENT_META: Record<string, { label: string; color: string; sign: '+' | '-' | '·' }> = {
  OPENING:   { label: 'افتتاح',        color: 'bg-blue-100 text-blue-700 border-blue-200',       sign: '+' },
  CLOSING:   { label: 'إغلاق',         color: 'bg-gray-100 text-gray-700 border-gray-200',       sign: '·' },
  SALE:      { label: 'بيع',           color: 'bg-green-100 text-green-700 border-green-200',    sign: '+' },
  CASH_IN:   { label: 'إيداع نقدي',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', sign: '+' },
  CASH_OUT:  { label: 'سحب نقدي',      color: 'bg-amber-100 text-amber-700 border-amber-200',    sign: '-' },
  EXPENSE:   { label: 'مصروف',         color: 'bg-red-100 text-red-700 border-red-200',          sign: '-' },
  REFUND:    { label: 'مرتجع',         color: 'bg-orange-100 text-orange-700 border-orange-200', sign: '-' },
}

export function CashModule() {
  const { user } = useAuthStore()
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [openingBalance, setOpeningBalance] = useState('0')
  const [openingSession, setOpeningSession] = useState(false)
  const [movementDialogOpen, setMovementDialogOpen] = useState(false)
  const [movementType, setMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementNote, setMovementNote] = useState('')
  const [savingMovement, setSavingMovement] = useState(false)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [actualCash, setActualCash] = useState('')
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/cash')
      setSession(data)
      if (data?.expectedCash !== undefined) {
        setActualCash(String(data.expectedCash.toFixed(2)))
      }
    } catch (e: any) {
      // No open session is not necessarily an error
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleOpen = async () => {
    if (!user?.id) { toast.error('المستخدم غير مسجل'); return }
    setOpeningSession(true)
    try {
      // Idempotency: opening a session twice with the same clientTxnId is a
      // no-op server-side (X-Client-Txn-Id cache hit) and on desktop
      // (cash_sessions.client_txn_id UNIQUE partial index). Prevents double
      // opening if the user double-taps "Open" or the network blips.
      const clientTxnId = generateUUID()
      const result = await apiFetch('/cash/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          userId: user.id,
          openingBalance: parseFloat(openingBalance) || 0,
          clientTxnId,
        }),
      })
      toast.success('تم فتح الخزنة بنجاح')
      setSession(result)
      setOpeningBalance('0')
    } catch (e: any) {
      toast.error(e.message || 'فشل فتح الخزنة')
    } finally {
      setOpeningSession(false)
    }
  }

  const handleMovement = async () => {
    if (!session) return
    const amt = parseFloat(movementAmount)
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return }
    setSavingMovement(true)
    try {
      // Idempotency: cash movements (CASH_IN / CASH_OUT) move real money;
      // a retry must not double-debit or double-credit the drawer.
      const clientTxnId = generateUUID()
      await apiFetch('/cash/movement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          sessionId: session.id,
          type: movementType,
          amount: amt,
          note: movementNote,
          userId: user?.id,
          clientTxnId,
        }),
      })
      toast.success(movementType === 'CASH_IN' ? 'تم الإيداع بنجاح' : 'تم السحب بنجاح')
      setMovementDialogOpen(false)
      setMovementAmount('')
      setMovementNote('')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'فشلت العملية')
    } finally {
      setSavingMovement(false)
    }
  }

  const handleClose = async () => {
    if (!session) return
    const amt = parseFloat(actualCash)
    if (isNaN(amt)) { toast.error('أدخل النقد الفعلي'); return }
    setClosing(true)
    try {
      // Idempotency: closing a session twice would post a duplicate CLOSING
      // movement and overwrite closingBalance/difference; guard with
      // X-Client-Txn-Id (server cache) + body.clientTxnId (desktop SQLite
      // cash_sessions.client_txn_id UNIQUE partial index).
      const clientTxnId = generateUUID()
      await apiFetch('/cash/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          sessionId: session.id,
          actualCash: amt,
          userId: user?.id,
          clientTxnId,
        }),
      })
      toast.success('تم إغلاق الخزنة')
      setCloseDialogOpen(false)
      setSession(null)
      setActualCash('')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'فشل الإغلاق')
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  // No open session
  if (!session) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            الخزنة
          </h1>
          <p className="text-muted-foreground text-sm">إدارة درج الكاش والجلسات النقدية</p>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
              <Lock className="w-8 h-8 text-amber-600" />
            </div>
            <CardTitle>الخزنة مغلقة</CardTitle>
            <p className="text-sm text-muted-foreground">لا توجد جلسة كاش مفتوحة. ابدأ بفتح خزنة جديدة.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opening-balance">رصيد الافتتاح (ج.م)</Label>
              <Input
                id="opening-balance"
                type="number"
                step="0.01"
                min="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                className="text-lg font-medium pos-number"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">أدخل المبلغ الموجود فعلياً في الدرج عند بدء الوردية</p>
            </div>
            <Button
              className="w-full h-11"
              onClick={handleOpen}
              disabled={openingSession}
            >
              <Unlock className="w-4 h-4 ml-2" />
              {openingSession ? 'جاري الفتح...' : 'فتح الخزنة'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Open session dashboard
  const expected = session.expectedCash ?? 0
  const sales = session.movements.filter((m: any) => m.type === 'SALE').reduce((s: number, m: any) => s + m.amount, 0)
  const expenses = session.movements.filter((m: any) => m.type === 'EXPENSE').reduce((s: number, m: any) => s + m.amount, 0)
  const cashIn = session.movements.filter((m: any) => m.type === 'CASH_IN').reduce((s: number, m: any) => s + m.amount, 0)
  const cashOut = session.movements.filter((m: any) => m.type === 'CASH_OUT').reduce((s: number, m: any) => s + m.amount, 0)
  const refunds = session.movements.filter((m: any) => m.type === 'REFUND').reduce((s: number, m: any) => s + m.amount, 0)
  const actual = parseFloat(actualCash) || 0
  const diff = actual - expected

  const summaryCards = [
    { label: 'رصيد الافتتاح', value: formatEGP(session.openingBalance), icon: PiggyBank, color: 'text-blue-600', bg: 'bg-blue-500/10' },
    { label: 'المبيعات النقدية', value: formatEGP(sales), icon: Receipt, color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'المصروفات', value: formatEGP(expenses), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-500/10' },
    { label: 'صافي الإيداعات/السحوبات', value: formatEGP(cashIn - cashOut), icon: Scale, color: 'text-amber-600', bg: 'bg-amber-500/10', sub: `إيداع: ${formatEGP(cashIn)} · سحب: ${formatEGP(cashOut)}` },
    { label: 'المرتجعات', value: formatEGP(refunds), icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-500/10' },
    { label: 'المتوقع', value: formatEGP(expected), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            الخزنة
          </h1>
          <p className="text-muted-foreground text-sm">
            مفتوحة منذ {formatDateTime(session.openedAt)} · {session.user?.name || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 ml-1" />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setMovementType('CASH_IN'); setMovementDialogOpen(true) }}>
            <ArrowDownToLine className="w-4 h-4 ml-1 text-green-600" />
            إيداع نقدي
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setMovementType('CASH_OUT'); setMovementDialogOpen(true) }}>
            <ArrowUpFromLine className="w-4 h-4 ml-1 text-amber-600" />
            سحب نقدي
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setCloseDialogOpen(true)}>
            <Lock className="w-4 h-4 ml-1" />
            إغلاق الخزنة
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <Unlock className="w-3 h-3 ml-1" />
          مفتوحة
        </Badge>
        <Badge variant="outline" className="text-xs">
          المستخدم: {session.user?.name || '—'}
        </Badge>
        {session.register && (
          <Badge variant="outline" className="text-xs">
            الدرج: {session.register.name || session.register.id}
          </Badge>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map((c, i) => {
          const Icon = c.icon
          return (
            <Card key={i}>
              <CardContent className="p-3 md:p-4">
                <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
                  <Icon className={`w-4.5 h-4.5 ${c.color}`} />
                </div>
                <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                <p className="text-sm md:text-base font-bold pos-number">{c.value}</p>
                {c.sub && <p className="text-[10px] text-muted-foreground mt-1">{c.sub}</p>}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Actual vs Expected */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="w-4 h-4 text-primary" />
            جرد الدرج
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>المتوقع في الدرج</Label>
              <div className="h-10 px-3 rounded-md bg-muted flex items-center font-bold pos-number">{formatEGP(expected)}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="actual-cash">الفعلي (عدّ النقد)</Label>
              <Input
                id="actual-cash"
                type="number"
                step="0.01"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="0.00"
                className="text-base font-bold pos-number"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>الفرق</Label>
              <div className={`h-10 px-3 rounded-md flex items-center font-bold pos-number ${
                Math.abs(diff) < 0.01 ? 'bg-green-100 text-green-700'
                : diff > 0 ? 'bg-blue-100 text-blue-700'
                : 'bg-red-100 text-red-700'
              }`}>
                {diff > 0 ? '+' : ''}{formatEGP(diff)}
              </div>
            </div>
          </div>
          {Math.abs(diff) >= 0.01 && actualCash !== '' && (
            <Alert className={`mt-4 ${diff > 0 ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'}`}>
              <AlertTriangle className={`w-4 h-4 ${diff > 0 ? 'text-blue-600' : 'text-red-600'}`} />
              <AlertDescription className={diff > 0 ? 'text-blue-700' : 'text-red-700'}>
                {diff > 0
                  ? `يوجد زيادة عن المتوقع بمقدار ${formatEGP(diff)} - تحقق من المعاملات النقدية`
                  : `يوجد عجز بمقدار ${formatEGP(Math.abs(diff))} - راجع المصروفات والمرتجعات`}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Movements table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">حركات الكاش ({session.movements?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {session.movements?.length ? (
            <ScrollArea className="h-[420px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>النوع</TableHead>
                    <TableHead className="text-left">المبلغ</TableHead>
                    <TableHead>الملاحظة</TableHead>
                    <TableHead>المرجع</TableHead>
                    <TableHead>الوقت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {session.movements.map((m: any) => {
                    const meta = MOVEMENT_META[m.type] || { label: m.type, color: 'bg-gray-100 text-gray-700 border-gray-200', sign: '·' }
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${meta.color}`}>
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-left font-bold pos-number ${meta.sign === '+' ? 'text-green-600' : meta.sign === '-' ? 'text-red-600' : ''}`}>
                          {meta.sign === '+' ? '+' : meta.sign === '-' ? '-' : ''}{formatEGP(m.amount)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={m.note || ''}>
                          {m.note || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.refType ? `${m.refType}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(m.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد حركات بعد</p>
          )}
        </CardContent>
      </Card>

      {/* Movement dialog */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {movementType === 'CASH_IN' ? 'إيداع نقدي' : 'سحب نقدي'}
            </DialogTitle>
            <DialogDescription>
              {movementType === 'CASH_IN'
                ? 'إيداع مبلغ نقدي إضافي إلى الدرج'
                : 'سحب مبلغ نقدي من الدرج (للنفقات أو الإيداع البنكي)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={movementType === 'CASH_IN' ? 'default' : 'outline'}
                onClick={() => setMovementType('CASH_IN')}
                className="justify-start"
              >
                <ArrowDownToLine className="w-4 h-4 ml-2 text-green-300" />
                إيداع
              </Button>
              <Button
                variant={movementType === 'CASH_OUT' ? 'default' : 'outline'}
                onClick={() => setMovementType('CASH_OUT')}
                className="justify-start"
              >
                <ArrowUpFromLine className="w-4 h-4 ml-2 text-amber-300" />
                سحب
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mv-amount">المبلغ (ج.م)</Label>
              <Input
                id="mv-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="0.00"
                className="pos-number"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mv-note">الملاحظة (اختياري)</Label>
              <Textarea
                id="mv-note"
                rows={2}
                value={movementNote}
                onChange={(e) => setMovementNote(e.target.value)}
                placeholder="سبب الإيداع أو السحب"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleMovement} disabled={savingMovement}>
              {savingMovement ? 'جاري الحفظ...' : 'تأكيد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إغلاق الخزنة</DialogTitle>
            <DialogDescription>أدخل النقد الفعلي في الدرج لإغلاق الجلسة وحساب الفرق</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1">رصيد الافتتاح</p>
                  <p className="text-sm font-bold pos-number">{formatEGP(session.openingBalance)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1">المتوقع</p>
                  <p className="text-sm font-bold pos-number text-purple-600">{formatEGP(expected)}</p>
                </CardContent>
              </Card>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="close-actual">النقد الفعلي (ج.م)</Label>
              <Input
                id="close-actual"
                type="number"
                step="0.01"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="0.00"
                className="pos-number"
                dir="ltr"
              />
            </div>
            {actualCash !== '' && !isNaN(parseFloat(actualCash)) && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                Math.abs(diff) < 0.01 ? 'bg-green-50 text-green-700'
                : diff > 0 ? 'bg-blue-50 text-blue-700'
                : 'bg-red-50 text-red-700'
              }`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="text-sm">
                  {Math.abs(diff) < 0.01
                    ? 'الفرق صفر - متطابق تماماً'
                    : diff > 0
                      ? `زيادة بمقدار ${formatEGP(diff)}`
                      : `عجز بمقدار ${formatEGP(Math.abs(diff))}`}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleClose} disabled={closing}>
              <Lock className="w-4 h-4 ml-1" />
              {closing ? 'جاري الإغلاق...' : 'إغلاق الخزنة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
