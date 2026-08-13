'use client'

import { useState, useEffect } from 'react'
import { formatEGP, formatDateTime } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, CheckCircle, Wallet, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'

export function ReceiptPrint({ sale, onClose }: { sale: any; onClose: () => void }) {
  const [printed, setPrinted] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [storeInfo, setStoreInfo] = useState({
    name: 'لمسة جمال - مستحضرات تجميل',
    address: 'شارع التحرير، القاهرة',
    phone: '0223456789',
    receiptFooter: 'لمسة جمال - جمالكِ يبدأ من هنا ✨',
  })

  // Fetch real store info from settings API
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.flat) {
          const settings: Record<string, string> = {}
          data.flat.forEach((s: any) => { settings[s.key] = s.value })
          setStoreInfo(prev => ({
            name: settings['store.name'] || prev.name,
            address: settings['store.address'] || prev.address,
            phone: settings['store.phone'] || prev.phone,
            receiptFooter: settings['receipt.footer'] || prev.receiptFooter,
          }))
        }
      })
      .catch(() => { /* use defaults */ })
  }, [])

  const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))

  // Build receipt data from the sale object
  const receipt = {
    invoiceNumber: sale.invoiceNumber,
    date: sale.createdAt,
    cashier: sale.user?.name || 'المستخدم',
    customer: sale.customer,
    store: storeInfo,
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

  // Generate QR code for the receipt — e-invoice style
  // Contains: invoice number, total, date, store (for verification)
  useEffect(() => {
    const qrPayload = JSON.stringify({
      type: 'BEAUTY_RECEIPT',
      invoice: receipt.invoiceNumber,
      total: receipt.total,
      date: receipt.date,
      store: receipt.store.name,
    })
    QRCode.toDataURL(qrPayload, {
      width: 150,
      margin: 1,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then(url => setQrDataUrl(url))
      .catch(() => { /* QR generation failed — receipt still works without it */ })
  }, [receipt.invoiceNumber, receipt.total, receipt.date, receipt.store.name])

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
        <title>إيصال ${esc(receipt.invoiceNumber)}</title>
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
          .qr { text-align: center; margin: 8px 0; }
          .qr img { width: 120px; height: 120px; }
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
        ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="QR" /><div class="small">امسح للتحقق من الفاتورة</div></div>` : ''}
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
    // Most thermal printers with attached cash drawer open it automatically
    // as part of every print job (hardware/driver feature).
    toast.info('أغلب الطابعات الحرارية بتفتح الدرج تلقائيًا مع كل عملية طباعة')
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-brand-purple">
            <CheckCircle className="w-6 h-6 text-green-500" />
            تمت الفاتورة بنجاح
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Success banner — branded gradient */}
          <div className="text-center p-4 bg-brand-gradient rounded-xl text-primary-foreground">
            <p className="font-bold text-xl pos-number">{receipt.invoiceNumber}</p>
            <p className="text-sm opacity-90 pos-number">{formatEGP(receipt.total)}</p>
            {receipt.loyaltyEarned > 0 && (
              <p className="text-xs mt-1 opacity-80">+ {receipt.loyaltyEarned} نقطة ولاء</p>
            )}
          </div>

          {/* QR code preview */}
          {qrDataUrl && (
            <div className="flex justify-center">
              <div className="text-center">
                <img src={qrDataUrl} alt="QR Code" className="w-24 h-24 mx-auto border border-border rounded-lg" />
                <p className="text-[10px] text-muted-foreground mt-1">رمز التحقق</p>
              </div>
            </div>
          )}

          {/* Receipt preview — thermal style */}
          <div className="border-2 border-dashed border-border rounded-lg p-3 font-mono text-xs max-h-60 overflow-y-auto bg-white" dir="rtl">
            <div className="text-center font-bold">{receipt.store.name}</div>
            <div className="text-center text-[10px] text-gray-500">{receipt.store.address}</div>
            <div className="text-center text-[10px] text-gray-500">ت: {receipt.store.phone}</div>
            <div className="border-t border-dashed my-2 pt-1">
              <div className="text-[10px]">فاتورة: {receipt.invoiceNumber}</div>
              <div className="text-[10px]">{formatDateTime(receipt.date)}</div>
              <div className="text-[10px]">الكاشير: {receipt.cashier}</div>
              {receipt.customer && <div className="text-[10px]">العميل: {receipt.customer.name}</div>}
            </div>
            {receipt.items.map((item: any, i: number) => (
              <div key={i} className="text-[10px] flex justify-between">
                <span>{item.product?.nameAr || item.product?.name || 'منتج'} ×{item.quantity}</span>
                <span className="pos-number">{formatEGP(item.total)}</span>
              </div>
            ))}
            <div className="border-t border-dashed mt-2 pt-1">
              <div className="text-[10px] flex justify-between"><span>المجموع:</span><span className="pos-number">{formatEGP(receipt.subtotal)}</span></div>
              {receipt.discountAmount > 0 && <div className="text-[10px] flex justify-between text-green-600"><span>الخصم:</span><span className="pos-number">- {formatEGP(receipt.discountAmount)}</span></div>}
              <div className="text-[10px] flex justify-between"><span>الضريبة:</span><span className="pos-number">{formatEGP(receipt.taxAmount)}</span></div>
              <div className="text-[10px] flex justify-between font-bold"><span>الإجمالي:</span><span className="pos-number">{formatEGP(receipt.total)}</span></div>
            </div>
          </div>

          {/* Action buttons — branded */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handlePrint} className="h-12 bg-brand-gradient hover:opacity-90">
              <Printer className="w-4 h-4 ml-2" />
              طباعة الإيصال
            </Button>
            <Button variant="outline" onClick={handleOpenDrawer} className="h-12 hover:border-primary hover:text-primary">
              <Wallet className="w-4 h-4 ml-2" />
              فتح الدرج
            </Button>
          </div>

          {printed && (
            <p className="text-xs text-center text-green-600 flex items-center justify-center gap-1">
              <CheckCircle className="w-3 h-3" />
              تم الإرسال للطابعة الحرارية
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full hover:border-primary hover:text-primary">
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
