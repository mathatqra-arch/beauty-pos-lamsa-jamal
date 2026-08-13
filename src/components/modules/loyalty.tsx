'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { apiFetch, formatEGP, formatNumber, formatDateTime, formatDate } from '@/lib/api'
import { generateUUID } from '@/lib/local-db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
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
  Star, Coins, Gift, Crown, Users, Plus, RefreshCw, Sparkles, TrendingDown,
  History,
} from 'lucide-react'
import { toast } from 'sonner'

const TIER_META: Record<string, { label: string; className: string; multiplier: number; discount: number }> = {
  BRONZE: { label: 'برونزي', className: 'bg-amber-700/10 text-amber-800 border-amber-700/30', multiplier: 1, discount: 0 },
  SILVER: { label: 'فضي', className: 'bg-gray-400/10 text-gray-700 border-gray-400/30', multiplier: 1.25, discount: 5 },
  GOLD: { label: 'ذهبي', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30', multiplier: 1.5, discount: 10 },
  VIP: { label: 'VIP', className: 'bg-purple-500/10 text-purple-700 border-purple-500/30', multiplier: 2, discount: 15 },
}

const TXN_TYPE_META: Record<string, { label: string; className: string }> = {
  EARN: { label: 'كسب', className: 'bg-green-500/10 text-green-700 border-green-500/20' },
  REDEEM: { label: 'استبدال', className: 'bg-orange-500/10 text-orange-700 border-orange-500/20' },
  BONUS: { label: 'مكافأة', className: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  REVERSE: { label: 'عكس', className: 'bg-red-500/10 text-red-700 border-red-500/20' },
  EXPIRE: { label: 'انتهاء', className: 'bg-gray-500/10 text-gray-700 border-gray-500/20' },
  ADJUSTMENT: { label: 'تسوية', className: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
}

const POINT_VALUE = 0.05 // EGP per point

function TierBadge({ tier }: { tier: string }) {
  const meta = TIER_META[tier] || TIER_META.BRONZE
  return (
    <Badge variant="outline" className={meta.className}>
      <Crown className="w-3 h-3 ml-1" />
      {meta.label}
    </Badge>
  )
}

export function LoyaltyModule() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-500" />
          نقاط الولاء
        </h1>
        <p className="text-muted-foreground text-sm">إدارة حسابات الولاء والحملات والمعاملات</p>
      </div>

      {/* Tier info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500" />
            مستويات العضوية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(TIER_META).map(([key, meta]) => (
              <div key={key} className={`p-3 rounded-lg border ${meta.className}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4" />
                  <p className="font-semibold">{meta.label}</p>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>مضاعفة النقاط:</span>
                    <span className="font-medium">{meta.multiplier}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الخصم:</span>
                    <span className="font-medium">{meta.discount}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="accounts">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="accounts"><Users className="w-4 h-4" /> الحسابات</TabsTrigger>
          <TabsTrigger value="campaigns"><Gift className="w-4 h-4" /> الحملات</TabsTrigger>
          <TabsTrigger value="transactions"><History className="w-4 h-4" /> المعاملات</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          <TransactionsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============ TAB 1: ACCOUNTS ============
function AccountsTab() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tierFilter, setTierFilter] = useState('all')
  const [redeemAccount, setRedeemAccount] = useState<any>(null)
  const [redeemPoints, setRedeemPoints] = useState('')
  const [redeemNote, setRedeemNote] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tierFilter !== 'all') params.set('tier', tierFilter)
      params.set('limit', '500')
      const data = await apiFetch(`/loyalty?${params.toString()}`)
      setAccounts(data || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [tierFilter])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const totalDistributed = accounts.reduce((s, a) => s + (a.totalEarned || 0), 0)
    const totalRedeemed = accounts.reduce((s, a) => s + (a.totalRedeemed || 0), 0)
    const totalAvailable = accounts.reduce((s, a) => s + (a.points || 0), 0)
    return { totalDistributed, totalRedeemed, totalAvailable, count: accounts.length }
  }, [accounts])

  const summaryCards = [
    { label: 'إجمالي النقاط الموزعة', value: formatNumber(stats.totalDistributed), icon: Coins, color: 'text-blue-600', bg: 'bg-blue-500/10' },
    { label: 'النقاط المستبدلة', value: formatNumber(stats.totalRedeemed), icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-500/10' },
    { label: 'النقاط المتاحة', value: formatNumber(stats.totalAvailable), icon: Sparkles, color: 'text-green-600', bg: 'bg-green-500/10' },
    { label: 'عدد العملاء', value: formatNumber(stats.count), icon: Users, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  ]

  const openRedeem = (a: any) => {
    setRedeemAccount(a)
    setRedeemPoints('')
    setRedeemNote('')
  }

  const confirmRedeem = async () => {
    const pts = parseInt(redeemPoints)
    if (!pts || pts <= 0) {
      toast.error('أدخل قيمة صحيحة للنقاط')
      return
    }
    if (pts > redeemAccount.points) {
      toast.error(`الرصيد غير كافي. المتاح: ${redeemAccount.points} نقطة`)
      return
    }
    setRedeeming(true)
    try {
      // Idempotency: redeem writes a loyalty_transactions REDEEM row +
      // decrements loyalty_account.points + queues a sync op. A duplicate
      // would double-debit the customer's points balance. Guard with
      // X-Client-Txn-Id (server) + body.clientTxnId (desktop
      // loyalty_transactions.client_txn_id UNIQUE partial index).
      const clientTxnId = generateUUID()
      await apiFetch('/loyalty/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          customerId: redeemAccount.customerId,
          points: pts,
          note: redeemNote || undefined,
          clientTxnId,
        }),
      })
      toast.success(`تم استبدال ${pts} نقطة بقيمة ${formatEGP(pts * POINT_VALUE)}`)
      setRedeemAccount(null)
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
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
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4" />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد حسابات ولاء</p>
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
                    <TableHead>العميل</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead className="text-center">النقاط الحالية</TableHead>
                    <TableHead className="text-center">المكتسبة</TableHead>
                    <TableHead className="text-center">المستبدلة</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.customer?.name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground" dir="ltr">{a.customer?.phone || '—'}</TableCell>
                      <TableCell><TierBadge tier={a.tier} /></TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="pos-number">{formatNumber(a.points)}</Badge>
                      </TableCell>
                      <TableCell className="text-center pos-number text-green-600">{formatNumber(a.totalEarned)}</TableCell>
                      <TableCell className="text-center pos-number text-orange-600">{formatNumber(a.totalRedeemed)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRedeem(a)}
                          disabled={(a.points || 0) <= 0}
                        >
                          <Gift className="w-4 h-4" />
                          استبدال
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {accounts.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium">{a.customer?.name || '—'}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{a.customer?.phone || '—'}</p>
                    </div>
                    <TierBadge tier={a.tier} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">الحالية</p>
                      <p className="font-bold text-sm pos-number">{formatNumber(a.points)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">المكتسبة</p>
                      <p className="font-bold text-sm pos-number text-green-600">{formatNumber(a.totalEarned)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">المستبدلة</p>
                      <p className="font-bold text-sm pos-number text-orange-600">{formatNumber(a.totalRedeemed)}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => openRedeem(a)}
                    disabled={(a.points || 0) <= 0}
                  >
                    <Gift className="w-4 h-4" />
                    استبدال النقاط
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Redeem dialog */}
      <Dialog open={!!redeemAccount} onOpenChange={(o) => !o && setRedeemAccount(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-500" />
              استبدال نقاط الولاء
            </DialogTitle>
            <DialogDescription>
              {redeemAccount?.customer?.name} - الرصيد المتاح: {formatNumber(redeemAccount?.points || 0)} نقطة
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="points">عدد النقاط للاستبدال</Label>
              <Input
                id="points"
                type="number"
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                placeholder="0"
                max={redeemAccount?.points || 0}
                min={1}
              />
              <p className="text-xs text-muted-foreground">
                القيمة = {formatEGP((parseInt(redeemPoints) || 0) * POINT_VALUE)}
                {' '}({formatNumber(POINT_VALUE * 100)} قرش/نقطة)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="note">ملاحظة (اختياري)</Label>
              <Textarea
                id="note"
                value={redeemNote}
                onChange={(e) => setRedeemNote(e.target.value)}
                placeholder="سبب الاستبدال"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemAccount(null)}>إلغاء</Button>
            <Button onClick={confirmRedeem} disabled={redeeming}>
              {redeeming ? 'جاري الاستبدال...' : 'تأكيد الاستبدال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ TAB 2: CAMPAIGNS ============
function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', startDate: '', endDate: '',
    pointsMultiplier: '1.0', bonusPoints: '0', minPurchase: '0', active: true,
  })

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/loyalty/campaigns?active=all')
      setCampaigns(data || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    if (!form.name) { toast.error('اسم الحملة مطلوب'); return }
    if (!form.startDate || !form.endDate) { toast.error('تاريخ البداية والنهاية مطلوبان'); return }
    setSaving(true)
    try {
      await apiFetch('/loyalty/campaigns', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      toast.success('تم إنشاء الحملة بنجاح')
      setDialogOpen(false)
      setForm({
        name: '', description: '', startDate: '', endDate: '',
        pointsMultiplier: '1.0', bonusPoints: '0', minPurchase: '0', active: true,
      })
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const today = new Date()
  const isCampaignActive = (c: any) => {
    if (!c.active) return false
    const start = new Date(c.startDate)
    const end = new Date(c.endDate)
    return today >= start && today <= end
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          حملة جديدة
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد حملات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const active = isCampaignActive(c)
            return (
              <Card key={c.id} className={!active ? 'opacity-70' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? 'bg-amber-500/10' : 'bg-gray-500/10'}`}>
                        <Gift className={`w-5 h-5 ${active ? 'text-amber-500' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(c.startDate)} - {formatDate(c.endDate)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={
                      active ? 'bg-green-500/10 text-green-700 border-green-500/20' :
                      'bg-gray-500/10 text-gray-600 border-gray-500/20'
                    }>
                      {active ? 'نشطة' : c.active ? 'منتهية' : 'متوقفة'}
                    </Badge>
                  </div>
                  {c.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{c.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                    <div className="p-2 rounded-md bg-blue-500/5">
                      <p className="text-muted-foreground">المضاعفة</p>
                      <p className="font-bold pos-number">{c.pointsMultiplier}x</p>
                    </div>
                    <div className="p-2 rounded-md bg-purple-500/5">
                      <p className="text-muted-foreground">نقاط مكافأة</p>
                      <p className="font-bold pos-number">{formatNumber(c.bonusPoints)}</p>
                    </div>
                    <div className="p-2 rounded-md bg-amber-500/5">
                      <p className="text-muted-foreground">حد الشراء</p>
                      <p className="font-bold pos-number">{formatEGP(c.minPurchase)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create campaign dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-500" />
              حملة ولاء جديدة
            </DialogTitle>
            <DialogDescription>أنشئ حملة لزيادة النقاط أو منح مكافآت</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="campName">اسم الحملة *</Label>
              <Input id="campName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: عرض الجمعة البيضاء" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="campDesc">الوصف</Label>
              <Textarea id="campDesc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="startDate">تاريخ البداية *</Label>
                <Input id="startDate" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endDate">تاريخ النهاية *</Label>
                <Input id="endDate" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="mult">المضاعفة</Label>
                <Input id="mult" type="number" step="0.1" value={form.pointsMultiplier} onChange={(e) => setForm({ ...form, pointsMultiplier: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bonus">نقاط المكافأة</Label>
                <Input id="bonus" type="number" value={form.bonusPoints} onChange={(e) => setForm({ ...form, bonusPoints: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="minp">حد الشراء</Label>
                <Input id="minp" type="number" value={form.minPurchase} onChange={(e) => setForm({ ...form, minPurchase: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} id="campActive" />
              <Label htmlFor="campActive">الحملة نشطة</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'إنشاء الحملة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ TAB 3: TRANSACTIONS ============
function TransactionsTab() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/loyalty?limit=500')
      setAccounts(data || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const transactions = useMemo(() => {
    const all: any[] = []
    accounts.forEach((a) => {
      // Each account's transactions aren't included by /loyalty, but we can use the per-customer endpoint if needed.
      // For simplicity we re-fetch on detail or aggregate from loyaltyAccount fields.
      // Here we just compute summary pseudo-rows. Better: query customer/[id] — but to keep tab self-contained,
      // we'll show a synthetic EARN + REDEEM summary per customer.
      // (Real per-transaction list would require a dedicated endpoint.)
      if (a.totalEarned > 0) {
        all.push({
          id: `${a.id}-earn`,
          customerName: a.customer?.name,
          type: 'EARN',
          points: a.totalEarned,
          note: 'إجمالي النقاط المكتسبة',
          createdAt: a.updatedAt,
        })
      }
      if (a.totalRedeemed > 0) {
        all.push({
          id: `${a.id}-redeem`,
          customerName: a.customer?.name,
          type: 'REDEEM',
          points: -a.totalRedeemed,
          note: 'إجمالي النقاط المستبدلة',
          createdAt: a.updatedAt,
        })
      }
    })
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [accounts])

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return transactions
    return transactions.filter((t) => t.type === typeFilter)
  }, [transactions, typeFilter])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="كل الأنواع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="EARN">كسب</SelectItem>
                <SelectItem value="REDEEM">استبدال</SelectItem>
                <SelectItem value="BONUS">مكافأة</SelectItem>
                <SelectItem value="REVERSE">عكس</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4" />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد معاملات</p>
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
                    <TableHead>العميل</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead className="text-center">النقاط</TableHead>
                    <TableHead>القيمة</TableHead>
                    <TableHead>المرجع</TableHead>
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const meta = TXN_TYPE_META[t.type] || TXN_TYPE_META.EARN
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.customerName || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className={`text-center pos-number font-medium ${t.points < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {t.points > 0 ? '+' : ''}{formatNumber(t.points)}
                        </TableCell>
                        <TableCell className="pos-number text-muted-foreground">{formatEGP(Math.abs(t.points) * POINT_VALUE)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.note || '—'}</TableCell>
                        <TableCell className="text-sm">{formatDateTime(t.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((t) => {
              const meta = TXN_TYPE_META[t.type] || TXN_TYPE_META.EARN
              return (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{t.customerName || '—'}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</p>
                      </div>
                      <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t.note || '—'}</span>
                      <span className={`font-bold pos-number ${t.points < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {t.points > 0 ? '+' : ''}{formatNumber(t.points)} نقطة
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
