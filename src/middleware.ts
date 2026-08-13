import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================================
// CORS MIDDLEWARE — Restrictive Origin Allow-list
// ============================================================
// Previous code allowed `Access-Control-Allow-Origin: *` together with
// `Authorization` header, which is a security hole: any malicious site
// could send authenticated requests to our API if a Bearer token leaked
// via XSS.
//
// Now we only allow specific known origins:
//   - Tauri desktop app (tauri://localhost, http://localhost:1420)
//   - Local development (http://localhost:3000)
//   - Production web app (configured via ALLOWED_ORIGIN env var)
// ============================================================

const ALLOWED_ORIGINS = [
  'tauri://localhost',
  'http://localhost:1420',
  'http://localhost:3000',
  'http://127.0.0.1:1420',
  'http://127.0.0.1:3000',
  // Production origin (set ALLOWED_ORIGIN env var on Vercel)
  process.env.ALLOWED_ORIGIN,
  // Default Vercel preview URL pattern
  process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : null,
].filter(Boolean) as string[]

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false
  if (ALLOWED_ORIGINS.includes(origin)) return true
  // Allow Vercel preview deployments (*.vercel.app) — they are authenticated previews
  if (origin.endsWith('.vercel.app') && process.env.NODE_ENV !== 'production') {
    return true
  }
  return false
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') || ''
  const allowedOrigin = isAllowedOrigin(origin) ? origin : (ALLOWED_ORIGINS[0] || '')

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Txn-Id',
        'Access-Control-Allow-Credentials': 'false',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    })
  }

  // Add CORS headers to all responses
  const response = NextResponse.next()
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Txn-Id')
  response.headers.set('Access-Control-Allow-Credentials', 'false')
  response.headers.set('Vary', 'Origin')

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')

  return response
}

export const config = {
  matcher: '/api/:path*',
}
