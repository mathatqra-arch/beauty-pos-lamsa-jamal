import { db } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/setup/status - check if system needs initial setup
export async function GET() {
  try {
    const userCount = await db.user.count()
    const productCount = await db.product.count()

    return successResponse({
      needsSetup: userCount === 0,
      hasUsers: userCount > 0,
      hasProducts: productCount > 0,
      userCount,
      productCount,
    })
  } catch (e: unknown) {
    // If tables don't exist, we need setup
    return successResponse({
      needsSetup: true,
      hasUsers: false,
      hasProducts: false,
      error: e instanceof Error ? e.message : "Unknown error",
    })
  }
}
