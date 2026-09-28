/**
 * QuickStore history dashboard — date range + list state.
 *
 * Pure and client-safe (no server imports): the History tab mirrors this state
 * in the URL and the `/history` + `/history/summary` routes parse the very same
 * query, so the dashboard and the API can never disagree about the range.
 *
 * All dates are LOCAL calendar days (`YYYY-MM-DD`). The client also sends its
 * UTC offset in minutes, so the server can turn "1–7 March" into real instants
 * and bucket the charts by the operator's day/hour — not the database's.
 */

export const HISTORY_PRESETS = ["today", "7d", "30d", "month", "all", "custom"] as const
export type HistoryPreset = (typeof HISTORY_PRESETS)[number]
export const HISTORY_DEFAULT_PRESET: HistoryPreset = "7d"

export const HISTORY_PAGE_SIZES = [10, 25, 50] as const
export const HISTORY_DEFAULT_PAGE_SIZE = 10
export const HISTORY_MAX_PAGE_SIZE = 100

export const HISTORY_STATUSES = ["all", "completed", "voided"] as const
export type HistoryStatus = (typeof HISTORY_STATUSES)[number]

export interface HistoryQuery {
  preset: HistoryPreset
  /** `YYYY-MM-DD`; empty for the open-ended "all" preset. */
  from: string
  /** `YYYY-MM-DD`, inclusive. */
  to: string
  status: HistoryStatus
  q: string
  page: number
  pageSize: number
}

export const HISTORY_PARAM_KEYS = [
  "range",
  "from",
  "to",
  "status",
  "q",
  "page",
  "limit",
] as const

export function hasHistoryParams(params: URLSearchParams): boolean {
  return HISTORY_PARAM_KEYS.some((key) => params.has(key))
}

// ── Local calendar day helpers ───────────────────────────────────────────────

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` for a date, in the browser's local calendar. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function parseDay(value: string | null): string | null {
  if (!value || !DAY_PATTERN.test(value)) return null
  // Rejects impossible days like 2026-02-31 (the Date normalises them away).
  const [y, m, d] = value.split("-").map(Number)
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null
  return value
}

/** Shift a `YYYY-MM-DD` key by whole days (local calendar, DST-safe). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return dayKey(new Date(y, m - 1, d + days))
}

/** The inclusive `from`…`to` window a preset covers, in local days. */
export function presetRange(
  preset: HistoryPreset,
  today: Date = new Date()
): { from: string; to: string } {
  const to = dayKey(today)

  switch (preset) {
    case "today":
      return { from: to, to }
    case "7d":
      return { from: addDays(to, -6), to }
    case "month":
      return { from: `${to.slice(0, 7)}-01`, to }
    case "all":
      return { from: "", to }
    case "custom":
    case "30d":
    default:
      return { from: addDays(to, -29), to }
  }
}

// ── Query parsing / serialising ──────────────────────────────────────────────

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

/** Read a query string into a complete, clamped history query. */
export function parseHistoryQuery(
  params: URLSearchParams,
  today: Date = new Date()
): HistoryQuery {
  const range = params.get("range")
  const preset: HistoryPreset = HISTORY_PRESETS.includes(range as HistoryPreset)
    ? (range as HistoryPreset)
    : HISTORY_DEFAULT_PRESET

  let from = ""
  let to = ""
  if (preset === "custom") {
    const fromParam = parseDay(params.get("from"))
    const toParam = parseDay(params.get("to"))
    if (!fromParam && !toParam) {
      // A custom range without dates is the 30-day window, not "everything".
      ;({ from, to } = presetRange("30d", today))
    } else {
      from = fromParam ?? (toParam as string)
      to = toParam ?? (fromParam as string)
      if (from > to) [from, to] = [to, from]
    }
  } else {
    ;({ from, to } = presetRange(preset, today))
  }

  const status = params.get("status")

  return {
    preset,
    from,
    to,
    status: HISTORY_STATUSES.includes(status as HistoryStatus)
      ? (status as HistoryStatus)
      : "all",
    q: (params.get("q") ?? "").trim(),
    page: clampInt(params.get("page"), 1, Number.MAX_SAFE_INTEGER, 1),
    pageSize: clampInt(params.get("limit"), 1, HISTORY_MAX_PAGE_SIZE, HISTORY_DEFAULT_PAGE_SIZE),
  }
}

/** Always-complete query for the API request. */
export function historyApiParams(query: HistoryQuery): URLSearchParams {
  const params = new URLSearchParams()
  params.set("range", query.preset)
  if (query.from) params.set("from", query.from)
  params.set("to", query.to)
  if (query.status !== "all") params.set("status", query.status)
  if (query.q) params.set("q", query.q)
  params.set("page", String(query.page))
  params.set("limit", String(query.pageSize))
  return params
}

/** URL query: defaults dropped, so an untouched dashboard keeps a clean URL. */
export function historyUrlParams(query: HistoryQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.preset !== HISTORY_DEFAULT_PRESET) params.set("range", query.preset)
  if (query.preset === "custom") {
    params.set("from", query.from)
    params.set("to", query.to)
  }
  if (query.status !== "all") params.set("status", query.status)
  if (query.q) params.set("q", query.q)
  if (query.page !== 1) params.set("page", String(query.page))
  if (query.pageSize !== HISTORY_DEFAULT_PAGE_SIZE) params.set("limit", String(query.pageSize))
  return params
}

/**
 * The dashboard query merged into an existing query string.
 *
 * The History tab shares its URL with the store page, so keys this module does
 * not own (`tab`, …) are kept untouched while the range / filter keys are
 * rewritten — a shared dashboard link stays on the tab it was opened on.
 */
export function withHistoryUrlParams(
  current: URLSearchParams,
  query: HistoryQuery
): URLSearchParams {
  const params = new URLSearchParams(current)
  for (const key of HISTORY_PARAM_KEYS) params.delete(key)
  historyUrlParams(query).forEach((value, key) => params.set(key, value))
  return params
}

/** The browser's UTC offset in minutes, clamped to the real-world range. */
export function tzOffsetMinutes(now: Date = new Date()): number {
  return Math.min(Math.max(-now.getTimezoneOffset(), -720), 840)
}

/**
 * Turn the local day window into UTC instants: `from` is inclusive and `to` is
 * exclusive (the start of the following local day), which keeps `paid_at >=
 * from AND paid_at < to` a plain index range scan.
 */
export function rangeInstants(
  query: Pick<HistoryQuery, "from" | "to">,
  tzOffset: number
): { fromInstant: string | null; toInstant: string } {
  const offset = Math.min(Math.max(Math.trunc(tzOffset) || 0, -720), 840)
  const startOf = (key: string) => {
    const [y, m, d] = key.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d) - offset * 60_000).toISOString()
  }

  return {
    fromInstant: query.from ? startOf(query.from) : null,
    toInstant: startOf(addDays(query.to, 1)),
  }
}

/** Short local label for a chart bucket, e.g. "12 Mar". */
export function dayLabel(key: string, lang: string): string {
  const [y, m, d] = key.split("-").map(Number)
  if (!y || !m || !d) return key
  return new Date(y, m - 1, d).toLocaleDateString(lang === "ID" ? "id-ID" : undefined, {
    day: "numeric",
    month: "short",
  })
}

