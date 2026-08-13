'use client'

import { useState } from 'react'
import { formatEGP, formatDateTime } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, CheckCircle, Wallet } from 'lucide-react'
import { toast } from 'sonner'

export function ReceiptPrint({ sale, onClose }: { sale: any; onClose: () => void }) {
  const [printed, setPrinted] = useState(false)

  const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))

  // Build receipt data directly from the sale object
  // No API call needed - we already have all the data
  const receipt = {
    invoiceNumber: sale.invoiceNumber,
    date: sale.createdAt,
    cashier: sale.user?.name || 'المستخدم',
    customer: sale.customer,
    store: {
      name: 'لمسة جمال - مستحضرات تجميل',
      address: 'شارع التحرير، القاهرة',
      phone: '0223456789',
      receiptFooter: 'لمسة جمال - جمالكِ يبدأ من هنا ✨',
    },
    items: sale.items || [],
    subtotal: sale.subtotal || 0,
    discountAmount: sale.discountAmount || 0,
    taxAmount: sale.taxAmount || 0,
    total: sale.total || 0,
    paidAmount: sale.paidAmount || 0,
    changeAmount: sale.changeAmount || 0,
    paymentMethod: sale.paymentMethod || 'CASH',
    loyaltyEarned: sale.loyaltyEarned || 0,
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) {
      toast.error('الرجاء السماح بالنوافذ المنبثقة للطباعة')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>إيصال ${receipt.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', 'Tajawal', Arial, sans-serif; }
          body { width: 80mm; padding: 5mm; font-size: 12px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .small { font-size: 10px; }
          .border-top { border-top: 1px dashed #000; margin-top: 5px; padding-top: 5px; }
          .border-bottom { border-bottom: 1px dashed #000; margin-bottom: 5px; padding-bottom: 5px; }
          .flex { display: flex; justify-content: space-between; }
          .item { margin-bottom: 3px; }
          @media print { @page { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size:16px;">${esc(receipt.store.name)}</div>
        <div class="center small">${esc(receipt.store.address)}</div>
        <div class="center small">ت: ${esc(receipt.store.phone)}</div>
        <div class="border-top border-bottom center small">
          <div>فاتورة رقم: <span class="bold">${esc(receipt.invoiceNumber)}</span></div>
          <div>${esc(formatDateTime(receipt.date))}</div>
          <div>الكاشير: ${esc(receipt.cashier)}</div>
          ${receipt.customer ? `<div>العميل: ${esc(receipt.customer.name || '')}</div>` : ''}
        </div>
        <div style="margin-top:5px;">
          ${receipt.items.map((item: any) => `
            <div class="item">
              <div class="flex">
                <span>${esc(item.product?.nameAr || item.product?.name || 'منتج')}</span>
                <span>${esc(item.quantity)}× ${esc(formatEGP(item.unitPrice))}</span>
              </div>
              <div class="flex bold small">
                <span>المجموع:</span>
                <span>${esc(formatEGP(item.total))}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="border-top">
          <div class="flex small"><span>المجموع الفرعي:</span><span>${esc(formatEGP(receipt.subtotal))}</span></div>
          ${receipt.discountAmount > 0 ? `<div class="flex small"><span>الخصم:</span><span>- ${esc(formatEGP(receipt.discountAmount))}</span></div>` : ''}
          <div class="flex small"><span>الضريبة:</span><span>${esc(formatEGP(receipt.taxAmount))}</span></div>
          <div class="flex bold" style="font-size:14px; margin-top:3px;"><span>الإجمالي:</span><span>${esc(formatEGP(receipt.total))}</span></div>
        </div>
        <div class="border-top small">
          <div class="flex"><span>طريقة الدفع:</span><span>${receipt.paymentMethod === 'CASH' ? 'نقدي' : receipt.paymentMethod === 'CARD' ? 'بطاقة' : esc(receipt.paymentMethod)}</span></div>
          <div class="flex"><span>المدفوع:</span><span>${esc(formatEGP(receipt.paidAmount))}</span></div>
          ${receipt.changeAmount > 0 ? `<div class="flex"><span>الباقي:</span><span>${esc(formatEGP(receipt.changeAmount))}</span></div>` : ''}
        </div>
        ${receipt.loyaltyEarned > 0 ? `<div class="border-top center small"><div>النقاط المكتسبة: ${esc(receipt.loyaltyEarned)}</div></div>` : ''}
        <div class="border-top center small" style="margin-top:5px;">
          <div>${esc(receipt.store.receiptFooter)}</div>
          <div style="margin-top:3px;">*** ${esc(receipt.invoiceNumber)} ***</div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `)
    printWindow.document.close()
    setPrinted(true)
    toast.success('تم إرسال الإيصال للطباعة')
  }

  const handleOpenDrawer = () => {
    // NOTE: This app has no ESC/POS or serial connection to the printer —
    // printing goes through the OS print dialog (window.print()), which
    // cannot send a raw drawer-kick command. Most thermal receipt printers
    // with an attached cash drawer open it automatically as part of every
    // print job (a hardware/driver feature, not something this app triggers).
    // We no longer claim to have sent a command that doesn't exist.
    toast.info('أغلب الطابعات الحرارية بتفتح الدرج تلقائيًا مع كل عملية طباعة')
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            تمت الفاتورة بنجاح
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-center p-3 bg-green-500/10 rounded-lg">
            <p className="font-bold text-lg">{receipt.invoiceNumber}</p>
            <p className="text-sm text-muted-foreground">{formatEGP(receipt.total)}</p>
          </div>

          {/* Receipt preview */}
          <div className="border-2 border-dashed rounded-lg p-3 font-mono text-xs max-h-60 overflow-y-auto bg-white" dir="rtl">
            <div className="text-center font-bold">{receipt.store.name}</div>
            <div className="text-center text-[10px] text-gray-500">{receipt.store.address}</div>
            <div className="text-center text-[10px] text-gray-500">ت: {receipt.store.phone}</div>
            <div className="border-t border-dashed my-2 pt-1">
              <div className="text-[10px]">فاتورة: {receipt.invoiceNumber}</div>
              <div className="text-[10px]">{formatDateTime(receipt.date)}</div>
              <div className="text-[10px]">الكاشير: {receipt.cashier}</div>
            </div>
            {receipt.items.map((item: any, i: number) => (
              <div key={i} className="text-[10px] flex justify-between">
                <span>{item.product?.nameAr || item.product?.name || 'منتج'} ×{item.quantity}</span>
                <span>{formatEGP(item.total)}</span>
              </div>
            ))}
            <div className="border-t border-dashed mt-2 pt-1">
              <div className="text-[10px] flex justify-between"><span>المجموع:</span><span>{formatEGP(receipt.subtotal)}</span></div>
              <div className="text-[10px] flex justify-between font-bold"><span>الإجمالي:</span><span>{formatEGP(receipt.total)}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handlePrint} className="h-12">
              <Printer className="w-4 h-4 ml-2" />
              طباعة الإيصال
            </Button>
            <Button variant="outline" onClick={handleOpenDrawer} className="h-12">
              <Wallet className="w-4 h-4 ml-2" />
              فتح الدرج
            </Button>
          </div>

          {printed && (
            <p className="text-xs text-center text-muted-foreground">
              ✓ تم الإرسال للطابعة الحرارية
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full">
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
