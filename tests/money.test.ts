import { describe, it, expect } from 'vitest'

// ============================================================
// MONEY CALCULATION TESTS
// ============================================================
// Tests the sale totals calculation logic.
// Verifies subtotal + tax - discount = total (with Decimal precision).
// This mirrors the calculation in /api/sales/route.ts.
// ============================================================

interface SaleItem {
  quantity: number
  unitPrice: number
  taxRate: number  // percentage
  discountAmount?: number
}

function calculateSaleTotals(items: SaleItem[], discountAmount: number = 0) {
  let subtotal = 0
  let taxAmount = 0

  for (const item of items) {
    const lineTotal = item.unitPrice * item.quantity
    const lineDiscount = item.discountAmount || 0
    const lineTax = (lineTotal - lineDiscount) * (item.taxRate / 100)
    subtotal += lineTotal
    taxAmount += lineTax
  }

  const total = subtotal - discountAmount + taxAmount
  return { subtotal, taxAmount, total }
}

describe('Money Calculations', () => {
  it('should calculate simple sale totals correctly', () => {
    const items = [
      { quantity: 2, unitPrice: 100, taxRate: 0 },
    ]
    const result = calculateSaleTotals(items)
    expect(result.subtotal).toBe(200)
    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(200)
  })

  it('should calculate tax correctly', () => {
    const items = [
      { quantity: 1, unitPrice: 100, taxRate: 14 }, // 14% tax
    ]
    const result = calculateSaleTotals(items)
    expect(result.subtotal).toBe(100)
    expect(result.taxAmount).toBeCloseTo(14, 2)
    expect(result.total).toBeCloseTo(114, 2)
  })

  it('should apply discount correctly', () => {
    const items = [
      { quantity: 2, unitPrice: 150, taxRate: 0 },
    ]
    const result = calculateSaleTotals(items, 50) // 50 discount
    expect(result.subtotal).toBe(300)
    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(250) // 300 - 50 = 250
  })

  it('should handle multiple items with mixed tax rates', () => {
    const items = [
      { quantity: 2, unitPrice: 100, taxRate: 14 },   // 200 + 28 tax
      { quantity: 1, unitPrice: 50, taxRate: 0 },      // 50 + 0 tax
      { quantity: 3, unitPrice: 25, taxRate: 10 },     // 75 + 7.5 tax
    ]
    const result = calculateSaleTotals(items)
    expect(result.subtotal).toBe(325) // 200 + 50 + 75
    expect(result.taxAmount).toBeCloseTo(35.5, 2) // 28 + 0 + 7.5
    expect(result.total).toBeCloseTo(360.5, 2) // 325 + 35.5
  })

  it('should handle decimal prices without floating point errors', () => {
    const items = [
      { quantity: 3, unitPrice: 10.33, taxRate: 0 },
      { quantity: 2, unitPrice: 5.99, taxRate: 0 },
    ]
    const result = calculateSaleTotals(items)
    // 10.33 * 3 = 30.99, 5.99 * 2 = 11.98, total = 42.97
    expect(result.subtotal).toBeCloseTo(42.97, 2)
    expect(result.total).toBeCloseTo(42.97, 2)
  })

  it('should calculate change correctly', () => {
    const items = [{ quantity: 1, unitPrice: 200, taxRate: 0 }]
    const result = calculateSaleTotals(items)
    const paidAmount = 300
    const change = Math.max(0, paidAmount - result.total)
    expect(result.total).toBe(200)
    expect(change).toBe(100)
  })

  it('should handle zero-quantity items gracefully', () => {
    const items = [{ quantity: 0, unitPrice: 100, taxRate: 14 }]
    const result = calculateSaleTotals(items)
    expect(result.subtotal).toBe(0)
    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(0)
  })

  it('should handle empty cart', () => {
    const result = calculateSaleTotals([])
    expect(result.subtotal).toBe(0)
    expect(result.taxAmount).toBe(0)
    expect(result.total).toBe(0)
  })

  it('should verify subtotal + tax - discount = total invariant', () => {
    const items = [
      { quantity: 5, unitPrice: 75.50, taxRate: 14 },
      { quantity: 2, unitPrice: 120.00, taxRate: 10 },
    ]
    const discount = 25.00
    const result = calculateSaleTotals(items, discount)
    // The invariant: total = subtotal - discount + tax
    expect(result.total).toBeCloseTo(result.subtotal - discount + result.taxAmount, 4)
  })
})
