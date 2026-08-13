import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/setup-db — check if DB needs setup
export async function GET() {
  try {
    const userCount = await db.user.count()
    return successResponse({
      needsSetup: userCount === 0,
      userCount,
      tablesExist: true,
    })
  } catch (e: unknown) {
    // Tables might not exist
    return successResponse({
      needsSetup: true,
      tablesExist: false,
      error: e instanceof Error ? e.message : "Unknown error",
    })
  }
}

// POST /api/setup-db — returns SQL instructions if tables don't exist
export async function POST(req: NextRequest) {
  try {
    // Check if User table exists
    try {
      const count = await db.user.count()
      return successResponse({
        message: 'قاعدة البيانات جاهزة',
        userCount: count,
        tablesExist: true,
      })
    } catch (e: unknown) {
      return errorResponse(
        'الجداول غير موجودة في Supabase. يرجى تشغيل supabase-schema.sql في Supabase SQL Editor',
        400
      )
    }
  } catch (e: unknown) {
    console.error("[API] error:", e); return errorResponse("حدث خطأ داخلي في الخادم", 500)
  }
}
