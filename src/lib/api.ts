'use client'

import { useAuthStore } from './store'
import { isDesktop } from './desktop-mode'

// ============================================================
// API CONFIGURATION
// ============================================================
// WEB: fetch('/api/...') → Next.js Server → Supabase
// DESKTOP: desktopApiFetch() → Local SQLite (offline primary)
//          If SQLite truly fails → throw error (no remote fallback)
// ============================================================

const PRODUCTION_URL = 'https://beauty-pos-lamsa-jamal.vercel.app'

export { PRODUCTION_URL }

/**
 * Get auth headers with the current Bearer token.
 * Use this for raw fetch() calls that need authentication.
 * For normal API calls, prefer apiFetch() which handles this automatically.
 */
export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Extract a readable error message from any thrown value.
 * Tauri SQL plugin throws errors as STRINGS (not Error objects),
 * so e.message is undefined. This handles all cases.
 */
function extractErrorMessage(e: any): string {
  if (!e) return 'حدث خطأ غير معروف'
  if (typeof e === 'string') return e
  if (e.message) return e.message
  if (typeof e.toString === 'function') {
    const s = e.toString()
    if (s && s !== '[object Object]') return s
  }
  try {
    return JSON.stringify(e)
  } catch {
    return 'حدث خطأ غير معروف'
  }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  // ============================================================
  // DESKTOP MODE — Use local SQLite for ALL operations
  // SQLite is the PRIMARY data store in desktop mode.
  // No remote fallback — if SQLite fails, the error propagates.
  // ============================================================
  if (isDesktop()) {
    try {
      const { desktopApiFetch } = await import('./desktop-api')
      const result = await desktopApiFetch(path, options)
      return result
    } catch (e: any) {
      const errMsg = extractErrorMessage(e)
      console.error('[Desktop API] SQLite operation failed for path:', path, '| Error:', errMsg)
      // In desktop mode, DO NOT fall through to remote API.
      // SQLite is the source of truth. Propagate the error.
      throw new Error(errMsg)
    }
  }

  // ============================================================
  // WEB MODE — fetch from Next.js API server
  // ============================================================
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `/api${path}`

  try {
    const res = await fetch(url, { ...options, headers })

    // Check if response is HTML (not JSON) — happens when URL is wrong
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const text = await res.text()
      console.error('[API] Non-JSON response:', text.substring(0, 200))
      throw new Error('استجابة غير صالحة من الخادم')
    }

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`
      try {
        const errorData = await res.json()
        errorMsg = errorData.error || errorData.message || errorMsg
      } catch {}
      throw new Error(errorMsg)
    }

    const data = await res.json()
    if (!data.success) {
      throw new Error(data.error || data.message || 'حدث خطأ')
    }
    return data.data
  } catch (e: any) {
    const msg = extractErrorMessage(e)
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new Error('لا يمكن الوصول للخادم - تحقق من الإنترنت')
    }
    throw e
  }
}

export function formatEGP(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0) + ' ج.م'
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('ar-EG').format(num || 0)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d)
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ar-EG', {
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}
