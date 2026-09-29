/**
 * The Items table's list state: search, availability filter, sort and paging.
 *
 * Shared by the Items tab (which mirrors it in the URL so a view is shareable
 * and survives the back button) and by the `listStoreItemsPage` Server Action
 * (which parses the very same query), so the client and the server can never
 * drift apart. Pure module — no server imports, safe in a Client Component.
 */

/** Page sizes the table offers (and the API accepts). */
export const ITEM_PAGE_SIZES = [10, 25, 50] as const
export const ITEM_DEFAULT_PAGE_SIZE = ITEM_PAGE_SIZES[0]
/**
 * Ceiling for the paged endpoint: a hand-typed `limit` above it is clamped
 * here, and `ITEM_PAGE_SIZES` is what the table may actually ask for.
 */
export const ITEM_MAX_PAGE_SIZE = ITEM_PAGE_SIZES[ITEM_PAGE_SIZES.length - 1]

/** Sortable columns — a whitelist, so the client can never order by raw SQL. */
export const ITEM_SORT_KEYS = ["name", "price", "stocks", "sold", "newest"] as const
export type ItemSortKey = (typeof ITEM_SORT_KEYS)[number]
export const ITEM_DEFAULT_SORT: ItemSortKey = "newest"
/**
 * Direction that pairs with the default sort: the Items table opens on the
 * newest first, so a freshly added item is always the first row.
 */
export const ITEM_DEFAULT_DIR: ItemSortDir = "desc"

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

/**
 * Coerce a hand-typed `limit` into one of the offered sizes.
 *
 * The table only knows 10 / 25 / 50, so anything else — `limit=99999`,
 * `limit=7`, or garbage like `limit=abc` — collapses to the largest offered
 * size (50). That keeps the dropdown, the request and the URL in agreement.
 */
function normalizePageSize(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  return (ITEM_PAGE_SIZES as readonly number[]).includes(parsed)
    ? parsed
    : ITEM_MAX_PAGE_SIZE
}

/** Read a query string into a fully populated, clamped query object. */
export function parseItemListQuery(params: URLSearchParams): ItemListQuery {
  const sort = params.get("sort")
  const availability = params.get("availability")
  const limit = params.get("limit")

  return {
    q: (params.get("q") ?? "").trim(),
    availability: ITEM_AVAILABILITIES.includes(availability as ItemAvailability)
      ? (availability as ItemAvailability)
      : "all",
    sort: ITEM_SORT_KEYS.includes(sort as ItemSortKey)
      ? (sort as ItemSortKey)
      : ITEM_DEFAULT_SORT,
    // Any missing or unknown value falls back to the direction that belongs to
    // `ITEM_DEFAULT_SORT` (newest → descending), so a fresh table lists the most
    // recent additions on top with a clean URL.
    dir: params.get("dir") === "asc" ? "asc" : ITEM_DEFAULT_DIR,
    page: clampInt(params.get("page"), 1, Number.MAX_SAFE_INTEGER, 1),
    pageSize:
      limit === null || limit.trim() === ""
        ? ITEM_DEFAULT_PAGE_SIZE
        : normalizePageSize(limit),
  }
}

/** Always-complete query for the API request (`page`/`limit` included). */
export function itemListApiParams(query: ItemListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.availability !== "all") params.set("availability", query.availability)
  if (query.sort !== ITEM_DEFAULT_SORT) params.set("sort", query.sort)
  if (query.dir !== ITEM_DEFAULT_DIR) params.set("dir", query.dir)
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

/**
 * The list query merged into an existing query string.
 *
 * The Items tab shares its URL with the store page, so keys this module does not
 * own (`tab`, …) are kept untouched while the item keys are rewritten — that is
 * what lets a searched / sorted / paged link stay on the tab it was opened on.
 */
export function withItemListUrlParams(
  current: URLSearchParams,
  query: ItemListQuery
): URLSearchParams {
  const params = new URLSearchParams(current)
  for (const key of ITEM_LIST_PARAM_KEYS) params.delete(key)
  itemListUrlParams(query).forEach((value, key) => params.set(key, value))
  return params
}
