'use client'

import { useEffect, useState } from 'react'
import { apiFetch, formatEGP, formatNumber } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package,
  AlertTriangle, Lightbulb, ArrowUpRight, ArrowDownRight, Wallet, Percent
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts'

const CHART_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#6b7280']

export function DashboardModule() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/dashboard').then(setData).finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  const kpis = [
    {
      label: 'مبيعات اليوم', value: formatEGP(data.todaySales), icon: DollarSign,
      change: data.weekGrowth, color: 'text-green-600', bg: 'bg-green-500/10',
    },
    {
      label: 'أرباح اليوم', value: formatEGP(data.todayProfit), icon: TrendingUp,
      change: data.profitMargin, suffix: '%', color: 'text-blue-600', bg: 'bg-blue-500/10',
    },
    {
      label: 'عدد الفواتير اليوم', value: formatNumber(data.todayCount), icon: ShoppingCart,
      color: 'text-purple-600', bg: 'bg-purple-500/10',
    },
    {
      label: 'متوسط الفاتورة', value: formatEGP(data.avgOrderValue), icon: Percent,
      color: 'text-amber-600', bg: 'bg-amber-500/10',
    },
    {
      label: 'العملاء', value: formatNumber(data.totalCustomers), icon: Users,
      sub: `+${data.newCustomersThisMonth} هذا الشهر`, color: 'text-cyan-600', bg: 'bg-cyan-500/10',
    },
    {
      label: 'المنتجات', value: formatNumber(data.totalProducts), icon: Package,
      color: 'text-indigo-600', bg: 'bg-indigo-500/10',
    },
    {
      label: 'مخزون منخفض', value: formatNumber(data.lowStockCount), icon: AlertTriangle,
      color: 'text-orange-600', bg: 'bg-orange-500/10',
    },
    {
      label: 'قيمة المخزون', value: formatEGP(data.inventoryValue), icon: Wallet,
      color: 'text-teal-600', bg: 'bg-teal-500/10',
    },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="text-muted-foreground text-sm">نظرة عامة على أداء المتجر</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm py-1.5 px-3">
            <TrendingUp className="w-3.5 h-3.5 ml-1" />
            مبيعات الشهر: {formatEGP(data.monthSales)}
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className={`w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  {kpi.change !== undefined && (
                    <div className={`flex items-center text-xs font-medium ${kpi.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {kpi.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(kpi.change).toFixed(1)}%
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                <p className="text-lg md:text-xl font-bold pos-number">{kpi.value}{kpi.suffix || ''}</p>
                {kpi.sub && <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">المبيعات - آخر 7 أيام</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.salesByDay}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v/1000}k`} />
                <Tooltip
                  formatter={(v: number) => formatEGP(v)}
                  contentStyle={{ direction: 'rtl', fontSize: '13px' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={2} fill="url(#colorSales)" name="المبيعات" />
                <Area type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={2} fillOpacity={0} name="الأرباح" />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment methods */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">طرق الدفع</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.salesByPaymentMethod}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {data.salesByPaymentMethod.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatEGP(v)} contentStyle={{ direction: 'rtl', fontSize: '13px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top products */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">المنتجات الأكثر مبيعاً</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topProducts.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.nameAr || p.name}</p>
                    <Progress value={(p.revenue / data.topProducts[0].revenue) * 100} className="h-1.5 mt-1" />
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-sm font-bold pos-number">{formatEGP(p.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(p.quantity)} وحدة</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Smart Insights */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              رؤى ذكية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto">
              {data.insights?.map((insight: any, i: number) => (
                <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                  insight.type === 'positive' ? 'bg-green-500/10' :
                  insight.type === 'warning' ? 'bg-orange-500/10' :
                  insight.type === 'negative' ? 'bg-red-500/10' : 'bg-blue-500/10'
                }`}>
                  <div className={`mt-0.5 shrink-0 ${
                    insight.type === 'positive' ? 'text-green-600' :
                    insight.type === 'warning' ? 'text-orange-600' :
                    insight.type === 'negative' ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {insight.type === 'positive' ? <TrendingUp className="w-4 h-4" /> :
                     insight.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> :
                     insight.type === 'negative' ? <TrendingDown className="w-4 h-4" /> :
                     <Lightbulb className="w-4 h-4" />}
                  </div>
                  <p className="text-xs leading-relaxed">{insight.message}</p>
                </div>
              ))}
              {(!data.insights || data.insights.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد رؤى حالياً</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">المبيعات حسب الفئة</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.salesByCategory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v/1000}k`} />
              <Tooltip formatter={(v: number) => formatEGP(v)} contentStyle={{ direction: 'rtl', fontSize: '13px' }} />
              <Bar dataKey="value" name="المبيعات" radius={[8, 8, 0, 0]}>
                {data.salesByCategory.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
