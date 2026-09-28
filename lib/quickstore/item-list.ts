/**
 * The Items table's list state: search, availability filter, sort and paging.
 *
 * Shared by the Items tab (which mirrors it in the URL so a view is shareable
 * and survives the back button) and by `GET /api/quickstore/stores/[id]/items`
 * (which parses the very same query), so the client and the server can never
 * drift apart. Pure module — no server imports, safe in a Client Component.
 */

/** Page sizes the table offers (and the API accepts). */
export const ITEM_PAGE_SIZES = [10, 25, 50] as const
export const ITEM_DEFAULT_PAGE_SIZE = 10
export const ITEM_MAX_PAGE_SIZE = 100

/** Sortable columns — a whitelist, so the client can never order by raw SQL. */
export const ITEM_SORT_KEYS = ["name", "price", "stocks", "sold", "newest"] as const
export type ItemSortKey = (typeof ITEM_SORT_KEYS)[number]
export const ITEM_DEFAULT_SORT: ItemSortKey = "name"

export const ITEM_AVAILABILITIES = ["all", "available", "unavailable"] as const
export type ItemAvailability = (typeof ITEM_AVAILABILITIES)[number]

export type ItemSortDir = "asc" | "desc"

export interface ItemListQuery {
  /** Free-text search over name + description. */
  q: string
  availability: ItemAvailability
  sort: ItemSortKey
  dir: ItemSortDir
  /** 1-based. */
  page: number
  pageSize: number
}

/**
 * The query keys this module owns. The items endpoint keeps answering a plain
 * array when none of them is sent (the cashier needs the whole catalog), and a
 * paged envelope as soon as one is — see the route for the full contract.
 */
export const ITEM_LIST_PARAM_KEYS = [
  "q",
  "availability",
  "sort",
  "dir",
  "page",
  "limit",
] as const

export function hasItemListParams(params: URLSearchParams): boolean {
  return ITEM_LIST_PARAM_KEYS.some((key) => params.has(key))
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

/** Read a query string into a fully populated, clamped query object. */
export function parseItemListQuery(params: URLSearchParams): ItemListQuery {
  const sort = params.get("sort")
  const availability = params.get("availability")

  return {
    q: (params.get("q") ?? "").trim(),
    availability: ITEM_AVAILABILITIES.includes(availability as ItemAvailability)
      ? (availability as ItemAvailability)
      : "all",
    sort: ITEM_SORT_KEYS.includes(sort as ItemSortKey)
      ? (sort as ItemSortKey)
      : ITEM_DEFAULT_SORT,
    dir: params.get("dir") === "desc" ? "desc" : "asc",
    page: clampInt(params.get("page"), 1, Number.MAX_SAFE_INTEGER, 1),
    pageSize: clampInt(params.get("limit"), 1, ITEM_MAX_PAGE_SIZE, ITEM_DEFAULT_PAGE_SIZE),
  }
}

/** Always-complete query for the API request (`page`/`limit` included). */
export function itemListApiParams(query: ItemListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.availability !== "all") params.set("availability", query.availability)
  if (query.sort !== ITEM_DEFAULT_SORT) params.set("sort", query.sort)
  if (query.dir !== "asc") params.set("dir", query.dir)
  params.set("page", String(query.page))
  params.set("limit", String(query.pageSize))
  return params
}

/** Human-readable query for the URL: defaults are dropped, so a clean table is a clean URL. */
export function itemListUrlParams(query: ItemListQuery): URLSearchParams {
  const params = itemListApiParams(query)
  if (query.page === 1) params.delete("page")
  if (query.pageSize === ITEM_DEFAULT_PAGE_SIZE) params.delete("limit")
  return params
}
