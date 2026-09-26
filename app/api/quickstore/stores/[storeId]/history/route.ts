/**
 * GET /api/quickstore/stores/[storeId]/history
 *
 * Latest recorded sales for a store (newest first) with their receipt lines.
 * `?limit=` defaults to 20 and is clamped to 1…100.
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getUserRole, getStoreHistory, HISTORY_DEFAULT_LIMIT } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "store:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const limitParam = req.nextUrl.searchParams.get("limit")
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : HISTORY_DEFAULT_LIMIT

  try {
    const sales = await getStoreHistory(storeId, parsedLimit)
    return NextResponse.json(sales)
  } catch (error) {
    console.error("[quickstore/history] failed", error)
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 })
  }
}
