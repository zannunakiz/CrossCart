/**
 * The QuickStore detail page's tab strip.
 *
 * The open tab lives in the URL (`?tab=store|items|history|members`) instead of
 * component state, so refreshing, bookmarking or sharing a link always reopens
 * the same view — and the Items/History tabs (which mirror their own filters in
 * the very same query string) keep the tab they were opened on.
 *
 * Pure module — no server imports, safe in a Client Component.
 */

export const STORE_TABS = ["store", "items", "history", "members"] as const
export type StoreTab = (typeof STORE_TABS)[number]

/** Query key that owns the active tab. */
export const STORE_TAB_PARAM = "tab"

/** Landing tab of every store. */
export const DEFAULT_STORE_TAB: StoreTab = "store"

/** The tab the URL asks for, or `null` when it is missing / unknown. */
export function parseStoreTab(params: URLSearchParams): StoreTab | null {
  const value = params.get(STORE_TAB_PARAM)
  return STORE_TABS.includes(value as StoreTab) ? (value as StoreTab) : null
}

/**
 * Which tab to render: the URL wins whenever the role may see it, otherwise the
 * first tab that role can open (a shared link may point at a hidden tab).
 */
export function resolveStoreTab(
  params: URLSearchParams,
  allowed: readonly StoreTab[]
): StoreTab {
  const requested = parseStoreTab(params)
  if (requested && allowed.includes(requested)) return requested
  return allowed[0] ?? DEFAULT_STORE_TAB
}

/** Query string for one tab, merged over the current params. */
export function storeTabUrlParams(
  current: URLSearchParams,
  tab: StoreTab
): URLSearchParams {
  const params = new URLSearchParams(current)
  params.set(STORE_TAB_PARAM, tab)
  return params
}
