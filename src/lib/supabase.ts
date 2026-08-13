// ============================================================
// SUPABASE SYNC HELPERS (stub)
// ============================================================
// This module was previously a full Supabase sync implementation.
// After Sprint 4 dead code cleanup, it's a stub that returns
// "not available" messages. The sync functionality is handled
// by sync-engine.ts and desktop-api.ts.
// ============================================================

export async function exportLocalToSupabase(): Promise<{ success: boolean; uploaded: number; message: string }> {
  return {
    success: false,
    uploaded: 0,
    message: 'تصدير Supabase غير متاح — استخدم sync engine المدمج',
  }
}

export async function importFromSupabase(): Promise<{ success: boolean; downloaded: number; message: string }> {
  return {
    success: false,
    downloaded: 0,
    message: 'استيراد Supabase غير متاح — استخدم sync engine المدمج',
  }
}

export async function testSupabaseConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
  if (!url || !key) {
    return { success: false, message: 'URL و Key مطلوبان' }
  }
  return {
    success: false,
    message: 'اختبار الاتصال غير متاح — sync engine يتعامل مع هذا تلقائياً',
  }
}

export function isSupabaseConfigured(): boolean {
  return false
}
