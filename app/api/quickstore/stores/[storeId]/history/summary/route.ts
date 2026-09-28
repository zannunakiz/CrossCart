/**
 * GET /api/quickstore/stores/[storeId]/history/summary
 *
 * The dashboard numbers for one window: totals, revenue series, peak hours,
 * best sellers, payment mix and cashier ranking — all aggregated in SQL.
 * Same query contract as `/history` (range, from, to, tzOffset, currency).
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getStoreHistorySummary, getUserRole } from "@/lib/quickstore/queries"
import { parseHistoryQuery, rangeInstants } from "@/lib/quickstore/history"
import { hasPermission } from "@/lib/quickstore/permissions"
import type { CurrencyType } from "@/lib/db/schema"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "sale:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const searchParams = req.nextUrl.searchParams
  const query = parseHistoryQuery(searchParams)
  const tzOffset = Number.parseInt(searchParams.get("tzOffset") ?? "0", 10) || 0
  const currency = searchParams.get("currency")

  try {
    const summary = await getStoreHistorySummary(
      storeId,
      { ...rangeInstants(query, tzOffset), tzOffset },
      (currency as CurrencyType | null) ?? undefined
    )
    return NextResponse.json({ range: { from: query.from, to: query.to }, ...summary })
  } catch (error) {
    console.error("[quickstore/history/summary] failed", error)
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 })
  }
}
