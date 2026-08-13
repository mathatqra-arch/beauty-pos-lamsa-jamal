'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============ AUTH STORE ============
interface AuthUser {
  id: string
  username: string
  name: string
  role: string
  permissions: string[]
  phone?: string
  pin?: string | null
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  login: (user: AuthUser, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'pos-auth' }
  )
)

// ============ POS CART STORE ============
export interface CartItem {
  productId: string
  name: string
  nameAr?: string
  barcode?: string
  sku: string
  price: number
  cost: number
  taxRate: number
  quantity: number
  stock: number
  image?: string
}

interface CartState {
  items: CartItem[]
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  loyaltyPoints: number
  loyaltyRedeem: number
  discountAmount: number
  discountType: 'FIXED' | 'PERCENT' | null
  note: string
  heldSales: any[]

  addItem: (item: CartItem) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, qty: number) => void
  setPrice: (productId: string, price: number) => void
  clearCart: () => void
  setCustomer: (id: string | null, name: string | null, phone: string | null, points?: number) => void
  setLoyaltyRedeem: (points: number) => void
  setDiscount: (amount: number, type: 'FIXED' | 'PERCENT') => void
  setNote: (note: string) => void
  holdSale: () => void
  retrieveHeldSale: (index: number) => void
  removeHeldSale: (index: number) => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customerId: null,
      customerName: null,
      customerPhone: null,
      loyaltyPoints: 0,
      loyaltyRedeem: 0,
      discountAmount: 0,
      discountType: null,
      note: '',
      heldSales: [],

      addItem: (item) => set((state) => {
        const existing = state.items.find(i => i.productId === item.productId)
        if (existing) {
          return {
            items: state.items.map(i =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            )
          }
        }
        return { items: [...state.items, item] }
      }),

      removeItem: (productId) => set((state) => ({
        items: state.items.filter(i => i.productId !== productId)
      })),

      updateQuantity: (productId, qty) => set((state) => ({
        items: qty <= 0
          ? state.items.filter(i => i.productId !== productId)
          : state.items.map(i => i.productId === productId ? { ...i, quantity: qty } : i)
      })),

      setPrice: (productId, price) => set((state) => ({
        items: state.items.map(i => i.productId === productId ? { ...i, price } : i)
      })),

      clearCart: () => set({
        items: [], customerId: null, customerName: null, customerPhone: null,
        loyaltyPoints: 0, loyaltyRedeem: 0, discountAmount: 0, discountType: null, note: ''
      }),

      setCustomer: (id, name, phone, points = 0) => set({
        customerId: id, customerName: name, customerPhone: phone,
        loyaltyPoints: points, loyaltyRedeem: 0
      }),

      setLoyaltyRedeem: (points) => set({ loyaltyRedeem: points }),

      setDiscount: (amount, type) => set({ discountAmount: amount, discountType: type }),

      setNote: (note) => set({ note }),

      holdSale: () => {
        const state = get()
        if (state.items.length === 0) return
        set({
          heldSales: [...state.heldSales, {
            items: state.items,
            customerId: state.customerId,
            customerName: state.customerName,
            customerPhone: state.customerPhone,
            loyaltyPoints: state.loyaltyPoints,
            discountAmount: state.discountAmount,
            discountType: state.discountType,
            note: state.note,
            timestamp: new Date().toISOString()
          }],
          items: [], customerId: null, customerName: null, customerPhone: null,
          loyaltyPoints: 0, loyaltyRedeem: 0, discountAmount: 0, discountType: null, note: ''
        })
      },

      retrieveHeldSale: (index) => {
        const state = get()
        const held = state.heldSales[index]
        if (!held) return
        set({
          items: held.items,
          customerId: held.customerId,
          customerName: held.customerName,
          customerPhone: held.customerPhone,
          loyaltyPoints: held.loyaltyPoints,
          discountAmount: held.discountAmount,
          discountType: held.discountType,
          note: held.note,
          heldSales: state.heldSales.filter((_, i) => i !== index)
        })
      },

      removeHeldSale: (index) => set((state) => ({
        heldSales: state.heldSales.filter((_, i) => i !== index)
      })),
    }),
    { name: 'pos-cart' }
  )
)

// ============ UI STORE ============
interface UIState {
  activeModule: string
  theme: 'light' | 'dark'
  sidebarOpen: boolean
  setModule: (module: string) => void
  toggleTheme: () => void
  toggleSidebar: () => void
  setSidebar: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeModule: 'dashboard',
      theme: 'light',
      sidebarOpen: true,
      setModule: (module) => set({ activeModule: module }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebar: (open) => set({ sidebarOpen: open }),
    }),
    { name: 'pos-ui' }
  )
)

// ============ CONNECTION STORE (offline/online) ============
interface ConnectionState {
  online: boolean
  syncing: boolean
  pendingSync: number
  setOnline: (online: boolean) => void
  setSyncing: (syncing: boolean) => void
  setPendingSync: (count: number) => void
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      online: true,
      syncing: false,
      pendingSync: 0,
      setOnline: (online) => set({ online }),
      setSyncing: (syncing) => set({ syncing }),
      setPendingSync: (count) => set({ pendingSync: count }),
    }),
    { name: 'pos-connection' }
  )
)
