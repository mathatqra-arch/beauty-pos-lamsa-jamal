'use client'

import { useAuthStore, useUIStore, useConnectionStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Receipt, Users, Award,
  Truck, Building2, Wallet, Receipt as ReceiptIcon, BarChart3, Settings,
  ScrollText, LogOut, Wifi, WifiOff, RefreshCw, Menu, Moon, Sun, Tags, Zap,
  X, PanelLeftClose, PanelLeftOpen, Monitor
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

const MODULES = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, roles: ['ADMIN','MANAGER','CASHIER','ACCOUNTANT'] },
  { id: 'pos', label: 'نقطة البيع', icon: ShoppingCart, roles: ['ADMIN','MANAGER','CASHIER'] },
  { id: 'products', label: 'المنتجات', icon: Package, roles: ['ADMIN','MANAGER','WAREHOUSE'] },
  { id: 'categories', label: 'الفئات', icon: Tags, roles: ['ADMIN','MANAGER','WAREHOUSE'] },
  { id: 'inventory', label: 'المخزون', icon: Boxes, roles: ['ADMIN','MANAGER','WAREHOUSE'] },
  { id: 'sales', label: 'المبيعات', icon: Receipt, roles: ['ADMIN','MANAGER','CASHIER','ACCOUNTANT'] },
  { id: 'customers', label: 'العملاء', icon: Users, roles: ['ADMIN','MANAGER','CASHIER'] },
  { id: 'loyalty', label: 'نقاط الولاء', icon: Award, roles: ['ADMIN','MANAGER'] },
  { id: 'purchases', label: 'المشتريات', icon: Truck, roles: ['ADMIN','MANAGER','WAREHOUSE'] },
  { id: 'suppliers', label: 'الموردون', icon: Building2, roles: ['ADMIN','MANAGER','WAREHOUSE'] },
  { id: 'cash', label: 'الخزنة', icon: Wallet, roles: ['ADMIN','MANAGER','CASHIER'] },
  { id: 'expenses', label: 'المصروفات', icon: ReceiptIcon, roles: ['ADMIN','MANAGER','ACCOUNTANT'] },
  { id: 'employees', label: 'الموظفون', icon: Users, roles: ['ADMIN'] },
  { id: 'reports', label: 'التقارير', icon: BarChart3, roles: ['ADMIN','MANAGER','ACCOUNTANT'] },
  { id: 'offline-test', label: 'الأوفلين والاختبار', icon: Zap, roles: ['ADMIN','MANAGER'] },
  { id: 'desktop', label: 'تحميل البرنامج', icon: Monitor, roles: ['ADMIN','MANAGER','CASHIER'] },
  { id: 'audit', label: 'سجل العمليات', icon: ScrollText, roles: ['ADMIN'] },
  { id: 'settings', label: 'الإعدادات', icon: Settings, roles: ['ADMIN'] },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const { activeModule, setModule, sidebarOpen, setSidebar, theme, toggleTheme } = useUIStore()
  const { online, syncing, pendingSync } = useConnectionStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const visibleModules = MODULES.filter(m => !user || m.roles.includes(user.role))

  if (!sidebarOpen) {
    return (
      <div className="w-16 border-l bg-sidebar flex flex-col items-center py-4 gap-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setSidebar(true)} title="فتح القائمة" className="h-10 w-10">
          <PanelLeftOpen className="w-5 h-5" />
        </Button>
        {visibleModules.map(m => {
          const Icon = m.icon
          return (
            <Button
              key={m.id}
              variant={activeModule === m.id ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setModule(m.id)}
              className="h-10 w-10"
              title={m.label}
            >
              <Icon className="w-5 h-5" />
            </Button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="w-64 border-l bg-sidebar flex flex-col shrink-0 h-screen sticky top-0">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm truncate">نظام نقاط البيع</h2>
            <p className="text-xs text-muted-foreground">Professional POS</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSidebar(false)} title="إغلاق القائمة">
            <PanelLeftClose className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2">
        <div className="py-3 space-y-1">
          {visibleModules.map(m => {
            const Icon = m.icon
            const active = activeModule === m.id
            return (
              <button
                key={m.id}
                onClick={() => setModule(m.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-right">{m.label}</span>
                {m.id === 'inventory' && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">!</Badge>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>

      {/* Connection Status */}
      <div className="px-3 py-2 border-t">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 text-xs">
          {mounted && !online ? (
            <>
              <WifiOff className="w-3.5 h-3.5 text-destructive" />
              <span className="text-destructive font-medium">غير متصل</span>
              {pendingSync > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px] mr-auto">{pendingSync}</Badge>}
            </>
          ) : syncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
              <span className="text-amber-600 font-medium">جاري المزامنة...</span>
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5 text-green-500" />
              <span className="text-green-600 font-medium">متصل</span>
            </>
          )}
        </div>
      </div>

      {/* User */}
      <Separator />
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{getRoleLabel(user?.role)}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1 h-8" onClick={toggleTheme}>
            {mounted && theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-8" onClick={logout}>
            <LogOut className="w-3.5 h-3.5 ml-1" />
            خروج
          </Button>
        </div>
      </div>
    </div>
  )
}

function getRoleLabel(role?: string) {
  const labels: Record<string, string> = {
    ADMIN: 'مدير النظام',
    MANAGER: 'مشرف',
    CASHIER: 'كاشير',
    WAREHOUSE: 'أمين مخزن',
    ACCOUNTANT: 'محاسب',
    OWNER: 'مالك',
  }
  return labels[role || ''] || role || ''
}
