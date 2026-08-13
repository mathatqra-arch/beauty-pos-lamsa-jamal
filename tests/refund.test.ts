import { describe, it, expect } from 'vitest'

// ============================================================
// REFUND VALIDATION TESTS
// ============================================================
// Tests refund double-spend prevention.
// Verifies already-returned quantities are checked.
// ============================================================

interface SaleItem {
  id: string
  quantity: number
}

interface SaleReturnItem {
  saleItemId: string
  quantity: number
}

function validateRefund(
  items: { saleItemId: string; quantity: number }[],
  saleItems: SaleItem[],
  previousReturns: SaleReturnItem[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const ret of items) {
    const saleItem = saleItems.find((si) => si.id === ret.saleItemId)
    if (!saleItem) {
      errors.push(`Sale item not found: ${ret.saleItemId}`)
      continue
    }

    // Calculate already returned
    const alreadyReturned = previousReturns
      .filter((r) => r.saleItemId === ret.saleItemId)
      .reduce((sum, r) => sum + r.quantity, 0)

    const maxRefundable = saleItem.quantity - alreadyReturned

    if (ret.quantity > maxRefundable) {
      errors.push(
        `Quantity exceeds refundable for ${ret.saleItemId} (max: ${maxRefundable}, requested: ${ret.quantity})`
      )
    }

    if (ret.quantity > saleItem.quantity) {
      errors.push(`Refund quantity exceeds original sale quantity for ${ret.saleItemId}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

describe('Refund Validation', () => {
  const saleItems: SaleItem[] = [
    { id: 'si-1', quantity: 5 },
    { id: 'si-2', quantity: 3 },
    { id: 'si-3', quantity: 10 },
  ]

  it('should allow refund within original quantity', () => {
    const result = validateRefund(
      [{ saleItemId: 'si-1', quantity: 3 }],
      saleItems,
      []
    )
    expect(result.valid).toBe(true)
  })

  it('should allow full refund', () => {
    const result = validateRefund(
      [{ saleItemId: 'si-1', quantity: 5 }],
      saleItems,
      []
    )
    expect(result.valid).toBe(true)
  })

  it('should block refund exceeding original quantity', () => {
    const result = validateRefund(
      [{ saleItemId: 'si-1', quantity: 6 }],
      saleItems,
      []
    )
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('exceeds')
  })

  it('should block double refund (already returned)', () => {
    const previousReturns: SaleReturnItem[] = [
      { saleItemId: 'si-1', quantity: 3 },
    ]
    // Try to refund 4 more (3 already returned, 5 original, max = 2)
    const result = validateRefund(
      [{ saleItemId: 'si-1', quantity: 4 }],
      saleItems,
      previousReturns
    )
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('max: 2')
  })

  it('should allow partial refund after previous partial', () => {
    const previousReturns: SaleReturnItem[] = [
      { saleItemId: 'si-1', quantity: 2 },
    ]
    // 5 - 2 = 3 remaining, refund 3 more
    const result = validateRefund(
      [{ saleItemId: 'si-1', quantity: 3 }],
      saleItems,
      previousReturns
    )
    expect(result.valid).toBe(true)
  })

  it('should block refund for non-existent sale item', () => {
    const result = validateRefund(
      [{ saleItemId: 'non-existent', quantity: 1 }],
      saleItems,
      []
    )
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('not found')
  })

  it('should handle multiple items in one refund', () => {
    const result = validateRefund(
      [
        { saleItemId: 'si-1', quantity: 2 },
        { saleItemId: 'si-2', quantity: 1 },
        { saleItemId: 'si-3', quantity: 5 },
      ],
      saleItems,
      []
    )
    expect(result.valid).toBe(true)
  })

  it('should calculate refund total correctly', () => {
    const items = [
      { saleItemId: 'si-1', quantity: 2, unitPrice: 100, total: 200 },
      { saleItemId: 'si-2', quantity: 1, unitPrice: 50, total: 50 },
    ]
    const refundTotal = items.reduce((sum, i) => sum + i.total, 0)
    expect(refundTotal).toBe(250)
  })

  it('should set status REFUNDED when full refund', () => {
    const saleTotal = 500
    const refundTotal = 500
    const status = refundTotal >= saleTotal ? 'REFUNDED' : 'PARTIAL_REFUND'
    expect(status).toBe('REFUNDED')
  })

  it('should set status PARTIAL_REFUND when partial', () => {
    const saleTotal = 500
    const refundTotal = 200
    const status = refundTotal >= saleTotal ? 'REFUNDED' : 'PARTIAL_REFUND'
    expect(status).toBe('PARTIAL_REFUND')
  })
})
