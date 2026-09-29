"use server"

/**
 * QuickStore — sales history.
 *
 * Direct port of `GET /api/quickstore/stores/[storeId]/history` and
 * `…/history/summary`. Both take the tab's URL query string verbatim
 * (`range`, `from`, `to`, `status`, `q`, `page`, `limit`, `tzOffset`, and
 * `currency` for the summary), parsed by the very same helper the tab uses, so
 * the dashboard and the server can never disagree about the window.
 *
 * Every number is aggregated in SQL — the client never receives a whole
 * history, only one page of receipts plus the chart totals.
 */
import type { CurrencyType } from "@/lib/db/schema"
import { parseHistoryQuery, rangeInstants } from "@/lib/quickstore/history"
import { hasPermission } from "@/lib/quickstore/permissions"
import {
  getStoreHistoryPage,
  getStoreHistorySummary,
  getUserRole,
} from "@/lib/quickstore/queries"
import type { HistorySummary } from "@/lib/quickstore/queries"
import type { Receipt } from "@/lib/quickstore/cashier"
import { currentSession } from "./context"
import { fail, ok, type ActionResult } from "./result"
import { jsonSafe } from "./serialize"

/** The window the answer belongs to, echoed back for the chart labels. */
type HistoryRange = { range: { from: string; to: string } }

/** One page of receipts (newest first, with their lines). */
export async function listStoreHistory(
  storeId: string,
  params: string
): Promise<
  ActionResult<HistoryRange & {
    sales: Receipt[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }>
> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "sale:view")) return fail("Forbidden", { status: 403 })

  const searchParams = new URLSearchParams(params)
  const query = parseHistoryQuery(searchParams)
  const tzOffset = Number.parseInt(searchParams.get("tzOffset") ?? "0", 10) || 0

  try {
    const page = await getStoreHistoryPage(
      storeId,
      { ...rangeInstants(query, tzOffset), tzOffset },
      {
        search: query.q,
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      }
    )
    return ok(jsonSafe({ range: { from: query.from, to: query.to }, ...page }))
  } catch {
    // console.error("[quickstore/history] failed", error)
    return fail("Failed to load history", { status: 500 })
  }
}

/**
 * The dashboard numbers for one window: totals, revenue series, peak hours,
 * best sellers, payment mix and cashier ranking — all aggregated in SQL.
 */
export async function getHistorySummary(
  storeId: string,
  params: string
): Promise<ActionResult<HistoryRange & HistorySummary>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "sale:view")) return fail("Forbidden", { status: 403 })

  const searchParams = new URLSearchParams(params)
  const query = parseHistoryQuery(searchParams)
  const tzOffset = Number.parseInt(searchParams.get("tzOffset") ?? "0", 10) || 0
  const currency = searchParams.get("currency")

  try {
    const summary = await getStoreHistorySummary(
      storeId,
      { ...rangeInstants(query, tzOffset), tzOffset },
      (currency as CurrencyType | null) ?? undefined
    )
    return ok(jsonSafe({ range: { from: query.from, to: query.to }, ...summary }))
  } catch {
    // console.error("[quickstore/history/summary] failed", error)
    return fail("Failed to load history", { status: 500 })
  }
}