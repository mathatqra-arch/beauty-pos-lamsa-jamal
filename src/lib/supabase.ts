// ============================================================
// لمسة جمال — Supabase helpers (re-export shim)
// ============================================================
// The old stub here has been replaced by the clean data layer in
// src/lib/data/. This file re-exports the real implementations so
// existing imports (`@/lib/supabase`) keep working without code churn.
//
// Migrate imports to:  import { ... } from '@/lib/data'
// ============================================================

export {
  testSupabaseConnection,
  syncNow as importFromSupabaseTrigger,
} from './data/sync'

/**
 * Export the local DB → Supabase (runs a full sync push).
 * Replaces the old exportLocalToSupabase stub.
 */
export async function exportLocalToSupabase(): Promise<{
  success: boolean; uploaded: number; message: string
}> {
  const { runFullSync } = await import('./data/sync')
  const res = await runFullSync()
  return {
    success: res.errors === 0,
    uploaded: res.pushed,
    message: res.errors === 0
      ? `تم رفع ${res.pushed} عملية بنجاح`
      : `تم رفع ${res.pushed} مع ${res.errors} أخطاء`,
  }
}

/**
 * Import (pull) from Supabase → local DB.
 * Replaces the old importFromSupabase stub.
 */
export async function importFromSupabase(): Promise<{
  success: boolean; downloaded: number; message: string
}> {
  const { runFullSync } = await import('./data/sync')
  const res = await runFullSync()
  return {
    success: res.errors === 0,
    downloaded: res.pulled,
    message: res.errors === 0
      ? `تم تنزيل ${res.pulled} تحديث`
      : `تم تنزيل ${res.pulled} مع ${res.errors} أخطاء`,
  }
}

/**
 * Whether Supabase credentials are configured.
 */
export function isSupabaseConfigured(): boolean {
  if (typeof window !== 'undefined') {
    return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  }
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
}
