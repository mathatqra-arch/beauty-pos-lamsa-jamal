'use client'

// ============================================================
// DESKTOP MODE DETECTION
// ============================================================
// Tauri v2 detection: checks multiple signals
// ============================================================

let _isDesktop: boolean | null = null

export function isDesktop(): boolean {
  if (_isDesktop !== null) return _isDesktop
  if (typeof window === 'undefined') return false

  // Method 1: Tauri global objects
  if ('__TAURI__' in window) { _isDesktop = true; return true }
  if ('__TAURI_INTERNALS__' in window) { _isDesktop = true; return true }
  if ('__TAURI_OS__' in window) { _isDesktop = true; return true }

  // Method 2: Protocol check (Tauri v2 on Windows uses https://tauri.localhost)
  if (typeof window.location !== 'undefined') {
    const { protocol, hostname } = window.location
    // Tauri v2 Windows: https://tauri.localhost
    if (hostname === 'tauri.localhost') { _isDesktop = true; return true }
    // Tauri v2 custom protocol
    if (protocol === 'tauri:') { _isDesktop = true; return true }
  }

  // Method 3: Check for Tauri IPC (window.__TAURI_INVOKE__)
  if (typeof (window as any).__TAURI_INVOKE__ === 'function') { _isDesktop = true; return true }

  // Method 4: User agent contains "Tauri"
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')) {
    _isDesktop = true
    return true
  }

  _isDesktop = false
  return false
}

export function isPWA(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

export function getAppMode(): 'desktop' | 'pwa' | 'web' {
  if (isDesktop()) return 'desktop'
  if (isPWA()) return 'pwa'
  return 'web'
}
