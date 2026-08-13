import { describe, it, expect } from 'vitest'

// ============================================================
// SERIALIZE DATA TESTS
// ============================================================
// Tests the Decimal-to-number conversion in successResponse.
// This is critical for frontend receiving numbers (not strings)
// for money fields after Sprint 2 Decimal migration.
// ============================================================

// Simulates the serializeData function from auth.ts
function serializeData(obj: any): any {
  if (obj === null || obj === undefined) return obj

  // Prisma Decimal — has toNumber() method (duck typing)
  if (typeof obj === 'object' && typeof obj.toNumber === 'function' && typeof obj.toString === 'function') {
    return obj.toNumber()
  }

  // Date — convert to ISO string
  if (obj instanceof Date) {
    return obj.toISOString()
  }

  // BigInt
  if (typeof obj === 'bigint') {
    return Number(obj)
  }

  // Array
  if (Array.isArray(obj)) {
    return obj.map(serializeData)
  }

  // Plain object
  if (typeof obj === 'object') {
    const result: any = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = serializeData(obj[key])
      }
    }
    return result
  }

  return obj
}

// Mock Prisma Decimal (simplified)
class MockDecimal {
  constructor(private value: number) {}
  toNumber(): number { return this.value }
  toString(): string { return String(this.value) }
}

describe('Serialize Data — Decimal Conversion', () => {
  it('should convert Decimal to number', () => {
    const data = { price: new MockDecimal(150.50) }
    const result = serializeData(data)
    expect(result.price).toBe(150.50)
    expect(typeof result.price).toBe('number')
  })

  it('should convert nested Decimal fields', () => {
    const data = {
      sale: {
        subtotal: new MockDecimal(200),
        items: [
          { unitPrice: new MockDecimal(100), total: new MockDecimal(100) },
          { unitPrice: new MockDecimal(100), total: new MockDecimal(100) },
        ],
      },
    }
    const result = serializeData(data)
    expect(result.sale.subtotal).toBe(200)
    expect(result.sale.items[0].unitPrice).toBe(100)
    expect(result.sale.items[1].total).toBe(100)
  })

  it('should convert arrays of Decimal objects', () => {
    const data = {
      prices: [new MockDecimal(10), new MockDecimal(20), new MockDecimal(30)],
    }
    const result = serializeData(data)
    expect(result.prices).toEqual([10, 20, 30])
  })

  it('should handle null and undefined', () => {
    expect(serializeData(null)).toBe(null)
    expect(serializeData(undefined)).toBe(undefined)
  })

  it('should convert Date to ISO string', () => {
    const date = new Date('2026-01-15T10:30:00Z')
    const result = serializeData({ createdAt: date })
    expect(result.createdAt).toBe('2026-01-15T10:30:00.000Z')
    expect(typeof result.createdAt).toBe('string')
  })

  it('should convert BigInt to number', () => {
    const result = serializeData({ count: BigInt(42) })
    expect(result.count).toBe(42)
    expect(typeof result.count).toBe('number')
  })

  it('should preserve regular strings and numbers', () => {
    const result = serializeData({ name: 'Test', quantity: 5, active: true })
    expect(result.name).toBe('Test')
    expect(result.quantity).toBe(5)
    expect(result.active).toBe(true)
  })

  it('should handle mixed object with Decimal, Date, string', () => {
    const data = {
      id: 'sale-123',
      total: new MockDecimal(350.75),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      customer: 'Ahmed',
      items: [
        { name: 'Perfume', price: new MockDecimal(175.50) },
      ],
    }
    const result = serializeData(data)
    expect(result.id).toBe('sale-123')
    expect(result.total).toBe(350.75)
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(result.customer).toBe('Ahmed')
    expect(result.items[0].price).toBe(175.50)
  })
})
