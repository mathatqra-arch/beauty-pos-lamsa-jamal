import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth-guard'
import type { SessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/print - generate receipt data for printing { saleId }
export const POST = withAuth('print.create', async (req: NextRequest, user: SessionUser) => {
  try {
    const body = await req.json()
    const { saleId } = body

    if (!saleId) return errorResponse('رقم الفاتورة مطلوب')

    const sale = await db.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: { include: { loyaltyAccount: true } },
        user: { select: { id: true, name: true, username: true } },
        register: { include: { store: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, nameAr: true, sku: true, barcode: true } },
          },
        },
        payments: true,
        returns: { include: { items: true } },
      },
    })
    if (!sale) return errorResponse('الفاتورة غير موجودة', 404)

    // Get store info
    let store: any = sale.register?.store || null
    if (!store) {
      store = await db.store.findFirst()
    }

    // Settings for receipt
    const settings = await db.setting.findMany()
    const settingMap = new Map<string, string>(settings.map((s): [string, string] => [s.key, s.value]))
    const currency = store?.currency || settingMap.get('general.currency') || 'EGP'
    const receiptFooter = store?.receiptFooter || settingMap.get('receipt.footer') || 'شكراً لزيارتكم'
    const taxRate = parseFloat(settingMap.get('tax.defaultRate') || '0')

    // Build items
    const items = sale.items.map((it) => ({
      name: it.product.nameAr || it.product.name,
      sku: it.product.sku,
      barcode: it.product.barcode,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discountAmount,
      tax: it.taxAmount,
      total: it.total,
    }))

    const payments = sale.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
    }))

    const returns = sale.returns.map((r) => ({
      returnNumber: r.returnNumber,
      total: r.total,
      reason: r.reason,
      status: r.status,
      itemCount: r.items.length,
    }))

    const receipt = {
      store: store
        ? {
            name: store.name,
            address: store.address,
            phone: store.phone,
            email: store.email,
            taxId: store.taxId,
            currency,
            logo: store.logo,
          }
        : null,
      invoice: {
        invoiceNumber: sale.invoiceNumber,
        date: sale.createdAt,
        user: sale.user,
        register: sale.register ? { id: sale.register.id, name: sale.register.name } : null,
        status: sale.status,
        paymentMethod: sale.paymentMethod,
        note: sale.note,
      },
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name,
            phone: sale.customer.phone,
            tier: sale.customer.tier,
            loyaltyPoints: sale.customer.loyaltyAccount?.points || 0,
          }
        : null,
      items,
      totals: {
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        discountType: sale.discountType,
        taxAmount: sale.taxAmount,
        total: sale.total,
        paidAmount: sale.paidAmount,
        changeAmount: sale.changeAmount,
        itemsCount: sale.items.length,
        itemsQuantity: sale.items.reduce((s, it) => s + it.quantity, 0),
      },
      payments,
      loyalty: {
        earned: sale.loyaltyEarned,
        redeemed: sale.loyaltyRedeemed,
        customerPoints: sale.customer?.loyaltyAccount?.points || 0,
      },
      returns,
      meta: {
        taxRate,
        receiptFooter,
        currency,
        generatedAt: new Date().toISOString(),
      },
    }

    return successResponse(receipt, 'بيانات الإيصال')
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
})
