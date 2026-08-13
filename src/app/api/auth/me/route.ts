import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, successResponse, errorResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return errorResponse('غير مصرح', 401)
  return successResponse(user)
}
