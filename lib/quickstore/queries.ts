/**
 * Server-side QuickStore query helpers.
 * Import only in API routes / Server Components.
 */
import { and, count, desc, eq, gte, ilike, isNull, lt, ne, or, sql } from "drizzle-orm"
import type { AnyColumn } from "drizzle-orm"

import { db } from "@/lib/db"
import { qsHistory, qsHistoryItems, storeItems, storeMembers, stores } from "@/lib/db/schema"
import type { CurrencyType, StoreItem, StoreRole } from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"
import type { Receipt } from "@/lib/quickstore/cashier"
import { mapReceiptRow } from "@/lib/quickstore/checkout-drizzle"
import {
  HISTORY_MAX_PAGE_SIZE,
  type HistoryStatus,
} from "@/lib/quickstore/history"
import { ITEM_MAX_PAGE_SIZE, type ItemListQuery } from "@/lib/quickstore/item-list"

/**
 * Get the authenticated user's role within a store.
 * Returns null if they are not a member (guest).
 *
 * NOTE: The store owner (stores.userId) is implicitly Master even if they
 * somehow don't appear in store_members. We handle that case below.
 *
 * Soft-deleted stores are treated as non-existent, which closes every read and
 * write path (items, members, history, checkout, voice) in one place.
 */
export async function getUserRole(
  userId: string,
  storeId: string
): Promise<StoreRole | null> {
  // A malformed id can never match a row — and would make Postgres raise 22P02 —
  // so it is simply "no role" here, which callers already translate to 403.
  if (!isUuid(storeId)) return null

  // Check if they're the store owner — owners are always Master
  const store = await db.query.stores.findFirst({
    where: and(eq(stores.id, storeId), isNull(stores.deletedAt)),
    columns: { userId: true },
  })
  if (!store) return null
  if (store.userId === userId) return "master"

  // Look up member record
  const member = await db.query.storeMembers.findFirst({
    where: and(
      eq(storeMembers.storeId, storeId),
      eq(storeMembers.userId, userId)
    ),
    columns: { role: true },
  })

  return member?.role ?? null
}

/** Check that the store exists and is owned or accessible by the user. */
export async function assertStoreAccess(userId: string, storeId: string) {
  const role = await getUserRole(userId, storeId)
  if (!role) {
    throw new Error("FORBIDDEN")
  }
  return role
}

// ── Sales history (History dashboard) ────────────────────────────────────────
// Every number the dashboard shows is aggregated in SQL inside the selected
// window: a busy store never ships thousands of receipts to draw a chart.

/** The window + bucketing a summary is computed for. */
export interface HistoryScope {
  /** Inclusive UTC instant; `null` for the open-ended ("all time") range. */
  fromInstant: string | null
  /** Exclusive UTC instant. */
  toInstant: string
  /** Operator's UTC offset in minutes — buckets follow THEIR day and hour. */
  tzOffset: number
}

export type HistoryGranularity = "day" | "week" | "month"

export interface HistoryTotals {
  sales: number
  items: number
  revenue: string
  discount: string
}

export interface HistoryPoint {
  /** Bucket key: `YYYY-MM-DD` (day / week start) or `YYYY-MM`. */
  key: string
  revenue: string
  sales: number
}

export interface HistorySlice {
  label: string
  sales: number
  revenue: string
  /** Units sold — only meaningful for item rows. */
  quantity: number
}

export interface HistorySummary {
  /** Currency every total/point below is expressed in (the dominant one). */
  currency: CurrencyType
  /** All currencies traded in the window, so mixed catalogs stay honest. */
  currencies: { currency: CurrencyType; sales: number; revenue: string }[]
  totals: HistoryTotals
  granularity: HistoryGranularity
  series: HistoryPoint[]
  byHour: { hour: number; sales: number; revenue: string }[]
  topItems: HistorySlice[]
  byCashier: HistorySlice[]
}

/** SQL for a money column: keeps numeric precision and is never null. */
const moneySum = (column: AnyColumn) => sql<string>`coalesce(sum(${column}), 0)::text`

/** Store scope + instant range filter for `paid_at`. */
function historyWhere(storeId: string, scope: HistoryScope) {
  return and(
    eq(qsHistory.storeId, storeId),
    scope.fromInstant ? gte(qsHistory.paidAt, new Date(scope.fromInstant)) : undefined,
    lt(qsHistory.paidAt, new Date(scope.toInstant))
  )
}

/**
 * Bucket width for the revenue chart: days for a month, weeks for half a year,
 * months beyond that (and for the open-ended "all time" range).
 */
function historyGranularity(scope: HistoryScope): HistoryGranularity {
  if (!scope.fromInstant) return "month"
  const days = (Date.parse(scope.toInstant) - Date.parse(scope.fromInstant)) / 86_400_000
  if (days <= 31) return "day"
  if (days <= 180) return "week"
  return "month"
}

/** UTC offsets are clamped, so inlining one can never inject SQL. */
function clampOffset(tzOffset: number): number {
  return Math.min(Math.max(Math.trunc(tzOffset) || 0, -720), 840)
}

/**
 * The SQL bucket expression + its key format, shifted into the operator's day.
 *
 * The granularity (closed whitelist), the day format and the clamped offset are
 * inlined instead of bound: Postgres only matches a SELECT expression against
 * its GROUP BY / ORDER BY when the two render identically, and a bound
 * parameter (`$2` in one clause, `$9` in the other) is not considered equal.
 */
function bucketSql(granularity: HistoryGranularity, tzOffset: number) {
  const shift = sql.raw(`(${clampOffset(tzOffset)}) * interval '1 minute'`)
  const truncated = sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${qsHistory.paidAt} + ${shift})`
  const format = granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD"
  return {
    shift,
    truncated,
    key: sql<string>`to_char(${truncated}, ${sql.raw(`'${format}'`)})`,
  }
}

/**
 * Everything the history dashboard needs for one window, as six parallel
 * aggregations: totals per currency, revenue series, hours, items and cashiers.
 */
export async function getStoreHistorySummary(
  storeId: string,
  scope: HistoryScope,
  currency?: CurrencyType
): Promise<HistorySummary> {
  // Voided receipts stay visible in the transaction list but never inflate the
  // revenue, counts or charts of the dashboard.
  const whereAll = and(historyWhere(storeId, scope), eq(qsHistory.status, "completed"))

  const currencies = await db
    .select({
      currency: qsHistory.currency,
      sales: count(),
      revenue: moneySum(qsHistory.total),
    })
    .from(qsHistory)
    .where(whereAll)
    .groupBy(qsHistory.currency)
    .orderBy(desc(count()))

  // Revenue is only added up inside one currency; the dominant one wins unless
  // the client asks for another.
  const primary: CurrencyType =
    currency && currencies.some((row) => row.currency === currency)
      ? currency
      : (currencies[0]?.currency ?? currency ?? "IDR")

  const where = and(whereAll, eq(qsHistory.currency, primary))
  const granularity = historyGranularity(scope)
  const bucket = bucketSql(granularity, scope.tzOffset)
  const hourOfDay = sql<number>`extract(hour from ${qsHistory.paidAt} + ${bucket.shift})::int`

  const [totals, series, byHour, topItems, byCashier] = await Promise.all([
    db
      .select({
        sales: count(),
        items: sql<number>`coalesce(sum(${qsHistory.itemCount}), 0)::int`,
        revenue: moneySum(qsHistory.total),
        discount: moneySum(qsHistory.discountTotal),
      })
      .from(qsHistory)
      .where(where),

    db
      .select({ key: bucket.key, revenue: moneySum(qsHistory.total), sales: count() })
      .from(qsHistory)
      .where(where)
      .groupBy(bucket.truncated)
      .orderBy(bucket.truncated),

    db
      .select({ hour: hourOfDay, revenue: moneySum(qsHistory.total), sales: count() })
      .from(qsHistory)
      .where(where)
      .groupBy(hourOfDay)
      .orderBy(hourOfDay),

    db
      .select({
        label: qsHistoryItems.name,
        quantity: sql<number>`coalesce(sum(${qsHistoryItems.quantity}), 0)::int`,
        revenue: moneySum(qsHistoryItems.lineTotal),
        sales: count(),
      })
      .from(qsHistoryItems)
      .innerJoin(qsHistory, eq(qsHistoryItems.historyId, qsHistory.id))
      .where(where)
      .groupBy(qsHistoryItems.name)
      .orderBy(desc(sql`sum(${qsHistoryItems.quantity})`))
      .limit(5),

    db
      .select({
        label: sql<string>`coalesce(${qsHistory.cashierName}, '')`,
        revenue: moneySum(qsHistory.total),
        sales: count(),
      })
      .from(qsHistory)
      .where(where)
      .groupBy(sql`coalesce(${qsHistory.cashierName}, '')`)
      .orderBy(desc(count()))
      .limit(5),
  ])

  const totalsRow = totals[0]

  return {
    currency: primary,
    currencies,
    totals: {
      sales: totalsRow?.sales ?? 0,
      items: totalsRow?.items ?? 0,
      revenue: totalsRow?.revenue ?? "0",
      discount: totalsRow?.discount ?? "0",
    },
    granularity,
    series,
    byHour,
    topItems: topItems.map((row) => ({ ...row })),
    byCashier: byCashier.map((row) => ({ ...row, quantity: 0 })),
  }
}

/** Filters of the transaction list under the dashboard. */
export interface HistoryListOptions {
  search: string
  status: HistoryStatus
  page: number
  pageSize: number
}

/**
 * One page of receipts in the window (newest first, with their lines). The
 * search matches the receipt number or the cashier's snapshot name.
 */
export async function getStoreHistoryPage(
  storeId: string,
  scope: HistoryScope,
  options: HistoryListOptions
): Promise<{
  sales: Receipt[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}> {
  const pageSize = Math.min(Math.max(options.pageSize, 1), HISTORY_MAX_PAGE_SIZE)
  const search = options.search ? `%${escapeLike(options.search)}%` : null

  const where = and(
    historyWhere(storeId, scope),
    options.status === "all" ? undefined : eq(qsHistory.status, options.status),
    search
      ? or(ilike(qsHistory.receiptNumber, search), ilike(qsHistory.cashierName, search))
      : undefined
  )

  const [counted] = await db.select({ value: count() }).from(qsHistory).where(where)
  const total = counted?.value ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(options.page, 1), totalPages)

  const rows = await db.query.qsHistory.findMany({
    where,
    orderBy: [desc(qsHistory.paidAt), desc(qsHistory.createdAt)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    with: {
      lines: true,
      // Fallback for receipts recorded before `cashierName` was snapshotted.
      cashier: { columns: { name: true } },
    },
  })

  return {
    sales: rows.map((row) => mapReceiptRow(row, row.cashier?.name ?? null, row.lines)),
    total,
    page,
    pageSize,
    totalPages,
  }
}

// ── Catalog (Items tab) ──────────────────────────────────────────────────────
// The table is filtered, sorted, counted and paged in SQL: a store with
// thousands of items still transfers one page of rows per request.

export interface StoreItemsPage {
  items: StoreItem[]
  total: number
  /** Clamped page actually returned — the client mirrors it back into the URL. */
  page: number
  pageSize: number
  totalPages: number
}

/** Escapes LIKE wildcards so a search for "50%" is a literal, not a pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * One page of a store's catalog for the Items table.
 *
 * Sorting is driven by the `ItemSortKey` whitelist (never raw column names),
 * `stocks = NULL` (unlimited) always sorts last, and a page past the end falls
 * back to the last real page instead of answering an empty table.
 */
export async function getStoreItemsPage(
  storeId: string,
  query: ItemListQuery
): Promise<StoreItemsPage> {
  const pageSize = Math.min(Math.max(query.pageSize, 1), ITEM_MAX_PAGE_SIZE)

  const search = query.q ? `%${escapeLike(query.q)}%` : null
  const where = and(
    eq(storeItems.storeId, storeId),
    query.availability === "all" ? undefined : eq(storeItems.available, query.availability === "available"),
    search
      ? or(ilike(storeItems.name, search), ilike(storeItems.description, search))
      : undefined
  )

  const [counted] = await db.select({ value: count() }).from(storeItems).where(where)
  const total = counted?.value ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(query.page, 1), totalPages)

  const items = await db.query.storeItems.findMany({
    where,
    orderBy: (i, { asc: ascBy, desc: descBy }) => {
      const direction = query.dir === "desc" ? descBy : ascBy
      switch (query.sort) {
        case "price":
          return [direction(i.price), ascBy(i.name)]
        case "stocks":
          // Unlimited stock (NULL) never wins a "lowest / highest stock" list.
          return [
            query.dir === "desc"
              ? sql`${i.stocks} desc nulls last`
              : sql`${i.stocks} asc nulls last`,
            ascBy(i.name),
          ]
        case "sold":
          return [direction(i.purchasedAmount), ascBy(i.name)]
        case "newest":
          return [direction(i.createdAt), ascBy(i.name)]
        default:
          // Name is also the tiebreaker of every other sort, kept stable.
          return [direction(i.name)]
      }
    },
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })

  return { items, total, page, pageSize, totalPages }
}

/**
 * Is this name already taken in the store? Case-insensitive, mirroring the
 * `store_items_store_name_unique` index — "Apple" and "aPPle" are the same item.
 *
 * `excludeItemId` lets an edit keep its own name. Answers the clashing item's id
 * (or `null`), so a caller can turn it into a friendly 409 `{ error }` instead of
 * leaking a raw unique-violation.
 */
export async function findStoreItemByName(
  storeId: string,
  name: string,
  excludeItemId?: string
): Promise<string | null> {
  const [clash] = await db
    .select({ id: storeItems.id })
    .from(storeItems)
    .where(
      and(
        eq(storeItems.storeId, storeId),
        sql`lower(${storeItems.name}) = ${name.trim().toLowerCase()}`,
        excludeItemId ? ne(storeItems.id, excludeItemId) : undefined
      )
    )
    .limit(1)

  return clash?.id ?? null
}

