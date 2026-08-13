'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { apiFetch, formatEGP } from '@/lib/api'
import { useCartStore, useAuthStore } from '@/lib/store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Search, ShoppingCart, Trash2, Plus, Minus, X, User, Tag, Pause, Play,
  CreditCard, Banknote, Wallet, Percent, Printer, Receipt, ChevronLeft,
  ScanLine, ShoppingBag, Gift, Keyboard
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ReceiptPrint } from '@/components/pos/receipt-print'
import { generateUUID } from '@/lib/local-db'

export function POSModule() {
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [loading, setLoading] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { user } = useAuthStore()
  const cart = useCartStore()

  // Load products & categories
  useEffect(() => {
    loadData()
  }, [])

  // Barcode scanner: rapid keypress detection.
  // Only active when focus is OUTSIDE any input/textarea — the search box
  // below has its own onKeyDown that already handles scans typed into it.
  // (Previously this ran unconditionally too, so scanning while the search
  // box was focused — the normal workflow — added every item to the cart
  // TWICE. isInInput was computed but never actually used to skip.)
  useEffect(() => {
    let buffer = ''
    let lastKeyTime = 0
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      if (isInInput) return

      const now = Date.now()
      if (now - lastKeyTime > 100) buffer = ''
      lastKeyTime = now

      if (e.key === 'Enter' && buffer.length >= 4) {
        e.preventDefault()
        handleBarcode(buffer)
        buffer = ''
      } else if (e.key.length === 1) {
        buffer += e.key
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [products])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'F3') { e.preventDefault(); setCustomerOpen(true) }
      if (e.key === 'F4') { e.preventDefault(); setDiscountOpen(true) }
      if (e.key === 'F5') { e.preventDefault(); handleHold() }
      if (e.key === 'F6') { e.preventDefault(); setHeldOpen(true) }
      if (e.key === 'F8') { e.preventDefault(); if (cart.items.length > 0) setPaymentOpen(true) }
      if (e.key === 'Escape') { e.preventDefault(); setPaymentOpen(false); setCustomerOpen(false); setDiscountOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart.items])

  const loadData = async () => {
    setLoading(true)
    try {
      // apiFetch automatically routes to SQLite in desktop mode
      const [prods, cats] = await Promise.all([
        apiFetch('/products?limit=200').catch(() => []),
        apiFetch('/categories').catch(() => []),
      ])

      setProducts(prods || [])
      setCategories(cats || [])
    } catch {
      setProducts([])
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const handleBarcode = async (barcode: string) => {
    const code = barcode.trim()
    if (!code) return
    const product = products.find(p => p.barcode === code || (p.barcodes && JSON.parse(p.barcodes).includes(code)))
    if (product) {
      addToCart(product)
      toast.success(`${product.nameAr || product.name} - تمت الإضافة`, { duration: 1500 })
    } else {
      toast.error(`الباركود غير موجود: ${code}`)
    }
    if (searchRef.current) searchRef.current.value = ''
    setSearch('')
  }

  const addToCart = (product: any) => {
    if (!product.active) { toast.error('المنتج غير مفعل'); return }
    const stock = product.currentStock ?? (product.stockLevels?.reduce((s: number, l: any) => s + l.quantity, 0) || 0)
    if (!product.allowNegativeStock && stock <= 0) {
      toast.error('المنتج غير متوفر في المخزون')
      return
    }
    cart.addItem({
      productId: product.id,
      name: product.name,
      nameAr: product.nameAr,
      barcode: product.barcode,
      sku: product.sku,
      price: product.sellingPrice,
      cost: product.avgCost || product.purchaseCost,
      taxRate: product.taxRate,
      quantity: 1,
      stock,
      image: product.image,
    })
  }

  const filteredProducts = products.filter(p => {
    const matchCat = activeCategory === 'all' || p.categoryId === activeCategory
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.nameAr?.includes(search) ||
      p.barcode?.includes(search) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch && p.active
  })

  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0)
  const taxAmount = cart.items.reduce((s, i) => s + (i.price * i.quantity * i.taxRate / 100), 0)
  const loyaltyDiscount = cart.loyaltyRedeem * 0.05 // 0.05 EGP per point
  const totalDiscount = cart.discountAmount + loyaltyDiscount
  const total = Math.max(0, subtotal + taxAmount - totalDiscount)

  const handleHold = () => {
    if (cart.items.length === 0) { toast.error('السلة فارغة'); return }
    cart.holdSale()
    toast.success('تم تعليق الفاتورة')
  }

  const handleCompleteSale = async (paymentData: any) => {
    const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0)
    const taxAmount = cart.items.reduce((s, i) => s + (i.price * i.quantity * i.taxRate / 100), 0)
    const loyaltyDiscount = cart.loyaltyRedeem * 0.05
    const totalDiscount = cart.discountAmount + loyaltyDiscount
    const total = Math.max(0, subtotal + taxAmount - totalDiscount)

    // Build sale object with items (for receipt)
    const saleData = {
      invoiceNumber: `INV-${Date.now()}`,
      customerId: cart.customerId,
      customer: cart.customerName ? { name: cart.customerName } : null,
      user: { name: user?.name || 'المستخدم' },
      items: cart.items.map(i => ({
        product: { nameAr: i.nameAr, name: i.name },
        quantity: i.quantity,
        unitPrice: i.price,
        total: i.price * i.quantity,
      })),
      subtotal,
      discountAmount: totalDiscount,
      taxAmount,
      total,
      paidAmount: paymentData.paid || total,
      changeAmount: Math.max(0, (paymentData.paid || total) - total),
      paymentMethod: paymentData.method,
      loyaltyEarned: cart.customerId ? Math.floor(total / 10) : 0,
      createdAt: new Date().toISOString(),
    }

    // Generate a stable clientTxnId BEFORE the network call so that
    // retries (network failures, timeouts) hit the server's idempotency
    // cache (X-Client-Txn-Id header lookup) and return the original sale
    // instead of creating a duplicate. Also threaded into the body so the
    // desktop SQLite handler (handleCreateSale) propagates the same id to
    // stock_movements / loyalty_transactions / cash_movements / sync_queue.
    const clientTxnId = generateUUID()

    try {
      // apiFetch routes to SQLite in desktop, API in web
      const sale = await apiFetch('/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Txn-Id': clientTxnId,
        },
        body: JSON.stringify({
          items: cart.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          customerId: cart.customerId,
          userId: user?.id,
          discountAmount: cart.discountAmount,
          discountType: cart.discountType,
          paymentMethod: paymentData.method,
          paymentDetails: paymentData.details,
          paidAmount: paymentData.paid,
          note: cart.note,
          loyaltyRedeem: cart.loyaltyRedeem,
          clientTxnId,
        })
      })
      setLastSale({ ...saleData, ...sale, items: sale.items || saleData.items })
      cart.clearCart()
      setPaymentOpen(false)
      toast.success(`تمت الفاتورة: ${sale.invoiceNumber}`)
      loadData()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="flex h-screen">
      {/* LEFT: Products */}
      <div className="flex-1 flex flex-col min-w-0 p-3 gap-3">
        {/* Search & barcode */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
            <Input
              ref={searchRef}
              placeholder="امسح الباركود أو ابحث عن منتج... (F2)"
              className="pr-10 h-12 text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search) {
                  handleBarcode(search)
                  setSearch('')
                }
              }}
            />
          </div>
          <Button
            variant="outline"
            size="lg"
            className="h-12 px-4"
            onClick={() => setHeldOpen(true)}
          >
            <Pause className="w-5 h-5" />
            <span className="text-xs">معلقة ({cart.heldSales.length})</span>
          </Button>
        </div>

        {/* Categories */}
        <ScrollArea className="whitespace-nowrap" orientation="horizontal">
          <div className="flex gap-2 pb-1">
            <Button
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory('all')}
              className="shrink-0"
            >
              الكل
            </Button>
            {categories.map(c => (
              <Button
                key={c.id}
                variant={activeCategory === c.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(c.id)}
                className="shrink-0"
              >
                {c.nameAr || c.name}
              </Button>
            ))}
          </div>
        </ScrollArea>

        {/* Products grid */}
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 pb-3">
            {filteredProducts.map(p => {
              const stock = p.currentStock ?? (p.stockLevels?.reduce((s: number, l: any) => s + l.quantity, 0) || 0)
              const inCart = cart.items.find(i => i.productId === p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className={cn(
                    "product-card relative bg-card border rounded-lg p-3 text-right hover:border-primary hover:shadow-md",
                    inCart && "border-primary ring-1 ring-primary",
                    stock <= 0 && !p.allowNegativeStock && "opacity-50"
                  )}
                >
                  {inCart && (
                    <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {inCart.quantity}
                    </div>
                  )}
                  <div className="aspect-square bg-muted rounded-md mb-2 flex items-center justify-center overflow-hidden">
                    {p.image ? (
                      <img src={p.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs font-medium line-clamp-2 mb-1 min-h-[2rem]">
                    {p.nameAr || p.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-primary pos-number">
                      {formatEGP(p.sellingPrice)}
                    </span>
                    <Badge variant={stock <= p.reorderLevel ? 'destructive' : 'secondary'} className="text-[10px] h-4 px-1">
                      {stock}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
          {filteredProducts.length === 0 && !loading && (
            <div className="text-center py-20 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد منتجات</p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* RIGHT: Cart */}
      <div className="w-[400px] shrink-0 border-l bg-card flex flex-col">
        {/* Cart header */}
        <div className="p-3 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              الفاتورة الحالية
            </h2>
            {cart.items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => cart.clearCart()}>
                <Trash2 className="w-4 h-4 ml-1" />
                مسح
              </Button>
            )}
          </div>
          {/* Customer */}
          <Button
            variant={cart.customerId ? 'secondary' : 'outline'}
            className="w-full justify-start h-10"
            onClick={() => setCustomerOpen(true)}
          >
            <User className="w-4 h-4 ml-2" />
            {cart.customerName || 'إضافة عميل (F3)'}
            {cart.customerId && (
              <Badge variant="secondary" className="mr-auto">
                {cart.loyaltyPoints} نقطة
              </Badge>
            )}
          </Button>
        </div>

        {/* Cart items */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {cart.items.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>السلة فارغة</p>
                <p className="text-xs mt-1">امسح الباركود أو اضغط على منتج</p>
              </div>
            ) : (
              cart.items.map(item => (
                <div key={item.productId} className="bg-muted/30 rounded-lg p-2.5">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.nameAr || item.name}
                      </p>
                      <p className="text-xs text-muted-foreground pos-number">
                        {formatEGP(item.price)} × {item.quantity}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive"
                      onClick={() => cart.removeItem(item.productId)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-background rounded-md">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => cart.updateQuantity(item.productId, item.quantity - 1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input
                        className="h-7 w-12 text-center pos-number border-0 px-0"
                        value={item.quantity}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value) || 0
                          cart.updateQuantity(item.productId, qty)
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => cart.updateQuantity(item.productId, item.quantity + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-bold mr-auto pos-number">
                      {formatEGP(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Summary & actions */}
        <div className="border-t p-3 space-y-2">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>المجموع الفرعي</span>
              <span className="pos-number">{formatEGP(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>الضريبة</span>
              <span className="pos-number">{formatEGP(taxAmount)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>الخصم {cart.loyaltyRedeem > 0 && `(${cart.loyaltyRedeem} نقطة)`}</span>
                <span className="pos-number">- {formatEGP(totalDiscount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>الإجمالي</span>
              <span className="pos-number text-primary">{formatEGP(total)}</span>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-10 flex-col text-[10px] gap-0.5"
              onClick={() => setDiscountOpen(true)}
              disabled={cart.items.length === 0}
            >
              <Tag className="w-4 h-4" />
              خصم
              <span className="kbd">F4</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 flex-col text-[10px] gap-0.5"
              onClick={handleHold}
              disabled={cart.items.length === 0}
            >
              <Pause className="w-4 h-4" />
              تعليق
              <span className="kbd">F5</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 flex-col text-[10px] gap-0.5"
              onClick={() => setHeldOpen(true)}
            >
              <Play className="w-4 h-4" />
              استرجاع
              <span className="kbd">F6</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 flex-col text-[10px] gap-0.5"
              onClick={() => setCustomerOpen(true)}
            >
              <User className="w-4 h-4" />
              عميل
              <span className="kbd">F3</span>
            </Button>
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-base font-bold"
            disabled={cart.items.length === 0}
            onClick={() => setPaymentOpen(true)}
          >
            <CreditCard className="w-5 h-5 ml-2" />
            دفع {formatEGP(total)}
            <span className="kbd mr-2 bg-primary-foreground/20">F8</span>
          </Button>
        </div>
      </div>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        total={total}
        onComplete={handleCompleteSale}
      />

      {/* Customer Dialog */}
      <CustomerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
      />

      {/* Discount Dialog */}
      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        subtotal={subtotal}
      />

      {/* Held Sales Dialog */}
      <HeldSalesDialog
        open={heldOpen}
        onOpenChange={setHeldOpen}
      />

      {/* Receipt Print Dialog */}
      {lastSale && (
        <ReceiptPrint
          sale={lastSale}
          onClose={() => setLastSale(null)}
        />
      )}
    </div>
  )
}

// ============ PAYMENT DIALOG ============
function PaymentDialog({ open, onOpenChange, total, onComplete }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  total: number
  onComplete: (data: any) => void
}) {
  const [method, setMethod] = useState('CASH')
  const [paidAmount, setPaidAmount] = useState('')
  const [splitCash, setSplitCash] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (open) {
      setMethod('CASH')
      setPaidAmount(total.toFixed(2))
      setSplitCash('')
      setSplitCard('')
    }
  }, [open, total])

  const paid = parseFloat(paidAmount) || 0
  const change = Math.max(0, paid - total)

  const handlePay = async () => {
    setProcessing(true)
    try {
      let paymentData: any = { method, paid: total }
      if (method === 'SPLIT') {
        const cash = parseFloat(splitCash) || 0
        const card = parseFloat(splitCard) || 0
        if (Math.abs(cash + card - total) > 0.01) {
          toast.error('مجموع الدفعات يجب أن يساوي الإجمالي')
          setProcessing(false)
          return
        }
        paymentData = {
          method: 'SPLIT',
          paid: total,
          details: { splits: [{ method: 'CASH', amount: cash }, { method: 'CARD', amount: card }] }
        }
      } else if (method === 'CASH') {
        paymentData = { method, paid: paid || total, details: { splits: [{ method: 'CASH', amount: total }] } }
      } else {
        paymentData = { method, paid: total, details: { splits: [{ method, amount: total }] } }
      }
      await onComplete(paymentData)
    } finally {
      setProcessing(false)
    }
  }

  const quickAmounts = [total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 100) * 100 + 100]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إتمام الدفع</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Total */}
          <div className="text-center bg-primary/10 rounded-xl p-4">
            <p className="text-sm text-muted-foreground">الإجمالي المطلوب</p>
            <p className="text-3xl font-bold text-primary pos-number">{formatEGP(total)}</p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { m: 'CASH', label: 'نقدي', icon: Banknote },
              { m: 'CARD', label: 'بطاقة', icon: CreditCard },
              { m: 'TRANSFER', label: 'تحويل', icon: Wallet },
              { m: 'SPLIT', label: 'مقسّم', icon: Percent },
            ].map(opt => {
              const Icon = opt.icon
              return (
                <Button
                  key={opt.m}
                  variant={method === opt.m ? 'default' : 'outline'}
                  className="flex-col h-16 gap-1"
                  onClick={() => setMethod(opt.m)}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs">{opt.label}</span>
                </Button>
              )
            })}
          </div>

          {method === 'CASH' && (
            <>
              <div className="space-y-2">
                <Label>المبلغ المدفوع</Label>
                <Input
                  type="number"
                  className="text-2xl h-14 text-center pos-number font-bold"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {quickAmounts.map((amt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setPaidAmount(amt.toFixed(2))}
                    className="pos-number"
                  >
                    {amt.toFixed(0)}
                  </Button>
                ))}
              </div>
              <div className="bg-green-500/10 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-green-700">الباقي للعميل</span>
                <span className="text-xl font-bold text-green-700 pos-number">{formatEGP(change)}</span>
              </div>
            </>
          )}

          {method === 'SPLIT' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>المبلغ نقداً</Label>
                <Input
                  type="number"
                  className="h-12 pos-number"
                  value={splitCash}
                  onChange={(e) => setSplitCash(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>المبلغ بالبطاقة</Label>
                <Input
                  type="number"
                  className="h-12 pos-number"
                  value={splitCard}
                  onChange={(e) => setSplitCard(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center pos-number">
                المتبقي: {formatEGP(total - (parseFloat(splitCash) || 0) - (parseFloat(splitCard) || 0))}
              </p>
            </div>
          )}

          {(method === 'CARD' || method === 'TRANSFER') && (
            <div className="bg-blue-500/10 rounded-lg p-4 text-center">
              <CreditCard className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <p className="text-sm">سيتم معالجة الدفع بقيمة {formatEGP(total)} عبر {method === 'CARD' ? 'البطاقة' : 'التحويل'}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="ml-2">
            إلغاء
          </Button>
          <Button onClick={handlePay} disabled={processing} size="lg" className="flex-1">
            {processing ? 'جاري المعالجة...' : 'تأكيد الدفع'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ CUSTOMER DIALOG ============
function CustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [phone, setPhone] = useState('')
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [foundCustomer, setFoundCustomer] = useState<any | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const cart = useCartStore()

  useEffect(() => {
    if (open) {
      setPhone('')
      setSearch('')
      setFoundCustomer(null)
      setShowNewForm(false)
      setNewName('')
      loadCustomers('')
    }
  }, [open])

  const loadCustomers = async (q: string) => {
    setLoading(true)
    try {
      const data = await apiFetch(`/customers?search=${encodeURIComponent(q)}`)
      setCustomers(data || [])
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }

  // Search by phone number
  const searchByPhone = async () => {
    if (!phone || phone.length < 3) return
    setLoading(true)
    setFoundCustomer(null)
    setShowNewForm(false)
    try {
      const data = await apiFetch(`/customers?search=${encodeURIComponent(phone)}`)
      const found = data?.find((c: any) => c.phone === phone)
      if (found) {
        setFoundCustomer(found)
      } else {
        setShowNewForm(true)
      }
    } catch {
      setShowNewForm(true)
    } finally {
      setLoading(false)
    }
  }

  const createCustomer = async () => {
    if (!newName.trim() || !phone.trim()) return
    setCreating(true)
    try {
      const data = await apiFetch('/customers', {
        method: 'POST',
        body: JSON.stringify({ name: newName, phone, tier: 'BRONZE' }),
      })
      cart.setCustomer(data.id, data.name, data.phone, 0)
      toast.success(`تم تسجيل عميل جديد: ${data.name}`)
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCreating(false)
    }
  }

  const selectCustomer = (c: any) => {
    cart.setCustomer(c.id, c.name, c.phone, c.loyaltyAccount?.points || 0)
    toast.success(`تم اختيار: ${c.name}`)
    onOpenChange(false)
  }

  const removeCustomer = () => {
    cart.setCustomer(null, null, null, 0)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>عميل الفاتورة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Phone search */}
          <div className="space-y-2">
            <Label>رقم هاتف العميل</Label>
            <div className="flex gap-2">
              <Input
                placeholder="010xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchByPhone()}
                autoFocus
                className="text-lg"
                dir="ltr"
              />
              <Button onClick={searchByPhone} disabled={loading || phone.length < 3}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Found customer */}
          {foundCustomer && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-600 font-bold">
                  {foundCustomer.name?.charAt(0) || '?'}
                </div>
                <div className="flex-1">
                  <p className="font-bold">{foundCustomer.name}</p>
                  <p className="text-sm text-muted-foreground">{foundCustomer.phone}</p>
                  {foundCustomer.loyaltyAccount && (
                    <Badge variant="secondary" className="mt-1">
                      <Gift className="w-3 h-3 ml-1" />
                      {foundCustomer.loyaltyAccount.points} نقطة
                    </Badge>
                  )}
                </div>
                <Button size="sm" onClick={() => selectCustomer(foundCustomer)}>
                  اختيار
                </Button>
              </div>
            </div>
          )}

          {/* New customer form */}
          {showNewForm && !foundCustomer && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
              <p className="text-sm text-amber-700 font-medium">
                رقم غير مسجل - سجل عميل جديد
              </p>
              <div className="space-y-2">
                <Label>الاسم</Label>
                <Input
                  placeholder="اسم العميل"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createCustomer()}
                  autoFocus
                />
              </div>
              <Button
                className="w-full"
                onClick={createCustomer}
                disabled={creating || !newName.trim()}
              >
                {creating ? 'جاري التسجيل...' : 'تسجيل العميل'}
              </Button>
            </div>
          )}

          {/* Divider */}
          <div className="relative py-1">
            <Separator />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
              أو ابحث بالاسم
            </span>
          </div>

          {/* Name search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pr-9"
              placeholder="ابحث بالاسم..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                loadCustomers(e.target.value)
              }}
            />
          </div>

          {/* Customer list */}
          <ScrollArea className="h-48">
            <div className="space-y-1">
              {customers.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectCustomer(c)}
                  className="w-full text-right p-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0 text-sm">
                    {c.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone}</p>
                  </div>
                  {c.loyaltyAccount && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {c.loyaltyAccount.points}
                    </Badge>
                  )}
                </button>
              ))}
              {customers.length === 0 && !loading && (
                <p className="text-center text-muted-foreground py-4 text-sm">لا يوجد عملاء</p>
              )}
            </div>
          </ScrollArea>

          {cart.customerId && (
            <Button variant="outline" className="w-full" onClick={removeCustomer}>
              <X className="w-4 h-4 ml-2" />
              إزالة: {cart.customerName}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============ DISCOUNT DIALOG ============
function DiscountDialog({ open, onOpenChange, subtotal }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  subtotal: number
}) {
  const [type, setType] = useState<'FIXED' | 'PERCENT'>('FIXED')
  const [value, setValue] = useState('')
  const cart = useCartStore()

  useEffect(() => {
    if (open) {
      setType(cart.discountType || 'FIXED')
      setValue(cart.discountAmount?.toString() || '')
    }
  }, [open])

  const apply = () => {
    const v = parseFloat(value) || 0
    if (type === 'PERCENT' && v > 100) {
      toast.error('نسبة الخصم لا يمكن أن تتجاوز 100%')
      return
    }
    if (type === 'FIXED' && v > subtotal) {
      toast.error('الخصم لا يمكن أن يتجاوز المجموع')
      return
    }
    cart.setDiscount(v, type)
    toast.success('تم تطبيق الخصم')
    onOpenChange(false)
  }

  const remove = () => {
    cart.setDiscount(0, 'FIXED')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>تطبيق خصم</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={type === 'FIXED' ? 'default' : 'outline'}
              onClick={() => setType('FIXED')}
            >
              مبلغ ثابت
            </Button>
            <Button
              variant={type === 'PERCENT' ? 'default' : 'outline'}
              onClick={() => setType('PERCENT')}
            >
              نسبة مئوية %
            </Button>
          </div>
          <div className="space-y-2">
            <Label>قيمة الخصم {type === 'PERCENT' ? '(%)' : '(ج.م)'}</Label>
            <Input
              type="number"
              className="h-12 text-lg pos-number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={remove} className="ml-2">إزالة</Button>
          <Button onClick={apply} className="flex-1">تطبيق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============ HELD SALES DIALOG ============
function HeldSalesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const cart = useCartStore()
  const [heldSales, setHeldSales] = useState<any[]>([])

  useEffect(() => {
    setHeldSales(cart.heldSales)
  }, [open, cart.heldSales])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>الفواتير المعلقة ({heldSales.length})</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-96">
          <div className="space-y-2">
            {heldSales.map((sale, i) => {
              const total = sale.items.reduce((s: number, it: any) => s + it.price * it.quantity, 0)
              return (
                <div key={i} className="border rounded-lg p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{sale.customerName || 'عميل نقدي'}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.items.length} أصناف • {formatEGP(total)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(sale.timestamp).toLocaleString('ar-EG')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      cart.retrieveHeldSale(i)
                      onOpenChange(false)
                      toast.success('تم استرجاع الفاتورة')
                    }}
                  >
                    <Play className="w-4 h-4 ml-1" />
                    استرجاع
                  </Button>
                </div>
              )
            })}
            {heldSales.length === 0 && (
              <p className="text-center text-muted-foreground py-8">لا توجد فواتير معلقة</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
