/**
 * QuickStore Cashier — pure domain logic.
 *
 * Everything in this module is deterministic and dependency-free (it only uses
 * TYPE-ONLY imports from the DB schema), so it can be unit tested without a
 * database, a browser or any Next.js runtime:
 *
 *   - product search / autocomplete ranking
 *   - quantity + stock availability rules
 *   - money math (all arithmetic happens in integer cents)
 *   - the checkout confirmation state machine used by the receipt panel
 *
 * Keep it that way: server-side orchestration lives in `lib/quickstore/checkout.ts`.
 */
import type { QsPaymentMethod } from "@/lib/db/schema"

/** Re-exported so consumers of the cashier domain need a single import. */
export type { QsPaymentMethod }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Autocomplete never shows more than this many suggestions. */
export const MAX_SUGGESTIONS = 3

/** Hard cap per line — protects the UI and the DB from absurd input. */
export const MAX_QTY_PER_LINE = 999

/** Hard cap on distinct lines per sale (matches the server validator). */
export const MAX_LINES = 50

/** Seconds the Confirm button stays locked to prevent accidental taps. */
export const COUNTDOWN_SECONDS = 3

/** Prices are typed as whole numbers: 12 digits is the hard ceiling. */
export const PRICE_MAX_DIGITS = 12

/** Tracked stock ceiling (a blank stock still means unlimited). */
export const MAX_STOCKS = 999

/** Line discount ceiling in percent (mirrors the `store_items` check constraint). */
export const MAX_DISCOUNT_PERCENT = 100

/** Ceiling of a description / item name, mirrored by the API validators. */
export const DESCRIPTION_MAX_LENGTH = 50
export const NAME_MAX_LENGTH = 20

/**
 * Answer of the items API when the store already owns that name. Names are
 * unique per store and case-insensitive, so "Apple" and "aPPle" clash — the rule
 * lives in the `store_items_store_name_unique` index and is mirrored on the
 * client by `serverText` (see `lib/i18n.ts`).
 */
export const ITEM_NAME_TAKEN_MESSAGE = "An item with this name already exists"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of a `store_items` row the cashier needs. */
export interface CashierItem {
  id: string
  name: string
  description?: string | null
  /** numeric(18,2) comes back from Postgres as a string. */
  price: string | number
  available: boolean
  /** null = unlimited / untracked stock. */
  stocks: number | null
  discountPercent: number
}

/** A fully priced line, resolved in the browser for instant receipt previews. */
export interface SaleLine {
  itemId: string
  name: string
  quantity: number
  unitPriceCents: number
  discountPercent: number
  unitPricePaidCents: number
  lineDiscountCents: number
  lineTotalCents: number
  available: boolean
  stocks: number | null
}

export interface SaleTotals {
  subtotalCents: number
  discountTotalCents: number
  totalCents: number
  /** Total units sold. */
  itemCount: number
  /** Distinct lines. */
  lineCount: number
}

export type CheckoutErrorCode =
  | "EMPTY_CART"
  | "INVALID_REQUEST"
  | "INVALID_QUANTITY"
  | "TOO_MANY_LINES"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "STORE_NOT_FOUND"

/** Per-line problem returned by the server so the UI can highlight the row. */
export interface CheckoutIssue {
  itemId: string
  name?: string
  code: CheckoutErrorCode
  message: string
  /** Units available right now, when known. */
  available?: number
  requested?: number
}

export interface ReceiptLine {
  id: string
  itemId: string | null
  name: string
  unitPrice: string
  discountPercent: number
  unitPricePaid: string
  quantity: number
  lineTotal: string
}

export interface Receipt {
  id: string
  storeId: string
  receiptNumber: string
  status: "completed" | "voided"
  subtotal: string
  discountTotal: string
  total: string
  itemCount: number
  lineCount: number
  paymentMethod: QsPaymentMethod
  note: string | null
  cashierId: string | null
  cashierName?: string | null
  paidAt: string
  createdAt: string
  lines: ReceiptLine[]
}


// ─────────────────────────────────────────────────────────────────────────────
// Product search / autocomplete
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Short queries must match from the start of the name/word: otherwise typing a
 * single "d" would surface every product that merely contains a "d" (candy!).
 * From 3 characters on we fall back to substring, description and subsequence
 * matching.
 */
const MIN_FUZZY_QUERY_LENGTH = 3

/** Lower-match-is-better score, or -1 when the item does not match at all. */
function scoreMatch(name: string, description: string, query: string): number {
  const n = name.toLowerCase()

  if (n === query) return 0
  if (n.startsWith(query)) return 1
  if (n.split(/[\s\-_/]+/).some((word) => word.startsWith(query))) return 2
  if (query.length < MIN_FUZZY_QUERY_LENGTH) return -1

  if (n.includes(query)) return 3
  if (description.toLowerCase().includes(query)) return 4
  // Loose subsequence match: "drts" still finds "Doritos".
  if (isSubsequence(query, n)) return 5
  return -1
}

function isSubsequence(query: string, value: string): boolean {
  let i = 0
  for (const char of value) {
    if (char === query[i]) i += 1
    if (i === query.length) return true
  }
  return query.length === 0
}

/**
 * Rank products against a search query and return at most `limit` results.
 *
 * Ordering: closest match first (exact → prefix → word prefix → substring →
 * subsequence), then sellable items, then A→Z. The hard `limit` is what keeps
 * the suggestion popup small even in big catalogs.
 */
export function rankItems<T extends CashierItem>(
  items: readonly T[],
  query: string,
  limit: number = MAX_SUGGESTIONS
): T[] {
  const q = query.trim().toLowerCase()
  if (limit <= 0) return []

  const scored = items
    .map((item, position) => ({
      item,
      position,
      score: q === "" ? 6 : scoreMatch(item.name, item.description ?? "", q),
    }))
    .filter((entry) => entry.score >= 0)

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    const aSellable = isSellable(a.item) ? 0 : 1
    const bSellable = isSellable(b.item) ? 0 : 1
    if (aSellable !== bSellable) return aSellable - bSellable
    const byName = a.item.name.localeCompare(b.item.name, undefined, { sensitivity: "base" })
    if (byName !== 0) return byName
    return a.position - b.position
  })

  return scored.slice(0, limit).map((entry) => entry.item)
}

/** Request body accepted by POST /checkout. */
export interface CheckoutRequestLine {
  itemId: string
  quantity: number
}

export interface CheckoutRequestBody {
  clientRequestId: string
  lines: CheckoutRequestLine[]
  paymentMethod?: QsPaymentMethod
  note?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Availability & quantity rules
// ─────────────────────────────────────────────────────────────────────────────

export type AvailabilityCode =
  | "ok"
  | "invalid_quantity"
  | "over_limit"
  | "unavailable"
  | "out_of_stock"
  | "insufficient_stock"

export interface AvailabilityResult {
  ok: boolean
  code: AvailabilityCode
  message: string
  /** Units still orderable right now (null = unlimited). */
  orderable: number | null
}

/** Can this product be sold at all (ignoring a specific quantity)? */
export function isSellable(item: Pick<CashierItem, "available" | "stocks">): boolean {
  if (!item.available) return false
  return item.stocks == null || item.stocks > 0
}

/** How many units can still be added (null = unlimited). */
export function orderableUnits(item: Pick<CashierItem, "available" | "stocks">): number | null {
  if (!item.available) return 0
  if (item.stocks == null) return null
  return Math.max(0, item.stocks)
}

/**
 * Validate a quantity against a product.
 * Returns `{ ok: true }` when the line may be sold.
 */
export function checkAvailability(item: CashierItem, quantity: number): AvailabilityResult {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      ok: false,
      code: "invalid_quantity",
      message: "Quantity must be a whole number of at least 1",
      orderable: orderableUnits(item),
    }
  }
  if (quantity > MAX_QTY_PER_LINE) {
    return {
      ok: false,
      code: "over_limit",
      message: `Maximum ${MAX_QTY_PER_LINE} per item`,
      orderable: Math.min(orderableUnits(item) ?? MAX_QTY_PER_LINE, MAX_QTY_PER_LINE),
    }
  }
  if (!item.available) {
    return {
      ok: false,
      code: "unavailable",
      message: `${item.name} is currently unavailable`,
      orderable: 0,
    }
  }
  if (item.stocks != null && item.stocks <= 0) {
    return {
      ok: false,
      code: "out_of_stock",
      message: `${item.name} is out of stock`,
      orderable: 0,
    }
  }
  if (item.stocks != null && quantity > item.stocks) {
    return {
      ok: false,
      code: "insufficient_stock",
      message: `Only ${item.stocks} ${item.name} left`,
      orderable: item.stocks,
    }
  }
  return { ok: true, code: "ok", message: "", orderable: orderableUnits(item) }
}

/**
 * Parse a raw input string into a quantity.
 * Returns null for anything that is not a positive whole number
 * (empty, "abc", "1.5", "-2", "0").
 */
export function parseQuantity(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

/**
 * Coerce a quantity into the largest valid value for the product, so the UI can
 * recover gracefully (e.g. typed "5000" becomes "999" or the available stock).
 */
export function clampQuantity(quantity: number, item: CashierItem): number {
  let next = Number.isInteger(quantity) && quantity > 0 ? quantity : 1
  next = Math.min(next, MAX_QTY_PER_LINE)
  const orderable = orderableUnits(item)
  if (orderable != null) next = Math.min(next, Math.max(orderable, 0))
  return next
}

/** Human readable label for an availability issue code. */
export function availabilityLabel(code: AvailabilityCode): string {
  switch (code) {
    case "invalid_quantity":
      return "Invalid quantity"
    case "over_limit":
      return "Quantity too large"
    case "unavailable":
      return "Unavailable"
    case "out_of_stock":
      return "Out of stock"
    case "insufficient_stock":
      return "Not enough stock"
    default:
      return "Available"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Money (integer cents — no floating point drift)
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a numeric(18,2) value ("12000.00", 12000) into integer cents. */
export function toCents(value: string | number): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

/** Render integer cents back as a fixed 2-decimal string for numeric(18,2). */
export function fromCents(cents: number): string {
  const rounded = Math.round(cents)
  const sign = rounded < 0 ? "-" : ""
  const abs = Math.abs(rounded)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

/**
 * Format integer cents for display: thousands separators, whole amount, no
 * currency symbol — `100000000` → `1.000.000`.
 */
export function formatCents(cents: number): string {
  return Math.round(cents / 100).toLocaleString("id-ID")
}

/**
 * The digits a price input currently holds, in display order.
 *
 * The price box only ever accepts numbers: anything else is dropped, and the
 * value is capped at `PRICE_MAX_DIGITS` digits so the amount can never overflow
 * `numeric(18,2)`.
 */
export function priceDigits(value: string | number): string {
  return String(value).replace(/\D/g, "").slice(0, PRICE_MAX_DIGITS)
}

/**
 * Re-format a price box on every keystroke: digits grouped in threes from the
 * right, e.g. `"1000"` → `"1.000"`, `"500"` → `"500"`.
 */
export function formatPriceInput(value: string | number): string {
  const digits = priceDigits(value)
  if (digits === "") return ""
  return Number(digits).toLocaleString("id-ID")
}

/** Parse a price box value ("1.000.000") into integer cents. */
export function priceToCents(value: string | number): number {
  const digits = priceDigits(value)
  if (digits === "") return 0
  return Number(digits) * 100
}

/**
 * Strict validator for a submitted price: whole numbers only, at most 12 of
 * them, with dots allowed every three digits ("1500", "1.500", "1.000.000").
 * Commas, signs, decimals and any other character are rejected.
 */
export function isPriceInput(value: unknown): boolean {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : ""
  if (text === "") return false
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(text)) return false
  const digits = text.replace(/\./g, "")
  return digits.length >= 1 && digits.length <= PRICE_MAX_DIGITS
}

/**
 * Validate a submitted stock value.
 * Returns `null` for a blank/unlimited stock, the number for a tracked one, and
 * `undefined` when the value is invalid (not an integer within 0-999).
 */
export function parseStockInput(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_STOCKS) return undefined
  return parsed
}

/** Unit price after the line discount, in cents. */
export function discountedUnitCents(unitPriceCents: number, discountPercent: number): number {
  const pct = Math.min(Math.max(discountPercent, 0), 100)
  return Math.round((unitPriceCents * (100 - pct)) / 100)
}

/** Build a priced cart line from a product + quantity. */
export function buildSaleLine(item: CashierItem, quantity: number): SaleLine {
  const unitPriceCents = toCents(item.price)
  const discountPercent = Math.min(Math.max(item.discountPercent ?? 0, 0), 100)
  const unitPricePaidCents = discountedUnitCents(unitPriceCents, discountPercent)
  const lineTotalCents = unitPricePaidCents * quantity

  return {
    itemId: item.id,
    name: item.name,
    quantity,
    unitPriceCents,
    discountPercent,
    unitPricePaidCents,
    lineDiscountCents: (unitPriceCents - unitPricePaidCents) * quantity,
    lineTotalCents,
    available: item.available,
    stocks: item.stocks,
  }
}

/** Sum a cart. All values are integer cents. */
export function computeTotals(lines: readonly SaleLine[]): SaleTotals {
  let subtotalCents = 0
  let discountTotalCents = 0
  let totalCents = 0
  let itemCount = 0

  for (const line of lines) {
    subtotalCents += line.unitPriceCents * line.quantity
    discountTotalCents += line.lineDiscountCents
    totalCents += line.lineTotalCents
    itemCount += line.quantity
  }

  return {
    subtotalCents,
    discountTotalCents,
    totalCents,
    itemCount,
    lineCount: lines.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart helpers (immutable; keeps the page component small)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a product to the cart, merging into the existing line when present.
 * Quantities are clamped to the available stock / per-line cap.
 */
export function addLine(lines: readonly SaleLine[], item: CashierItem, quantity = 1): SaleLine[] {
  const existing = lines.find((line) => line.itemId === item.id)
  const wanted =
    (existing?.quantity ?? 0) + (Number.isInteger(quantity) && quantity > 0 ? quantity : 1)
  const nextQuantity = clampQuantity(wanted, item)

  if (existing) {
    return lines.map((line) =>
      line.itemId === item.id ? buildSaleLine(item, nextQuantity) : line
    )
  }
  return [...lines, buildSaleLine(item, nextQuantity)]
}

/** Set an explicit quantity for a line (clamped). `quantity <= 0` removes it. */
export function updateLineQuantity(
  lines: readonly SaleLine[],
  item: CashierItem,
  quantity: number
): SaleLine[] {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return removeLine(lines, item.id)
  }
  return lines.map((line) =>
    line.itemId === item.id ? buildSaleLine(item, clampQuantity(quantity, item)) : line
  )
}

export function removeLine(lines: readonly SaleLine[], itemId: string): SaleLine[] {
  return lines.filter((line) => line.itemId !== itemId)
}

/**
 * Merge duplicated lines and drop items that disappeared from the catalog.
 * Used when the catalog is refreshed (stock edits by another operator).
 */
export function reconcileLines(
  lines: readonly SaleLine[],
  catalog: readonly CashierItem[]
): SaleLine[] {
  const merged = new Map<string, SaleLine>()
  for (const line of lines) {
    const item = catalog.find((candidate) => candidate.id === line.itemId)
    if (!item) continue
    const quantity = (merged.get(line.itemId)?.quantity ?? 0) + line.quantity
    merged.set(line.itemId, buildSaleLine(item, clampQuantity(quantity, item)))
  }
  return [...merged.values()]
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout confirmation state machine
// ─────────────────────────────────────────────────────────────────────────────

export type CheckoutState =
  | { phase: "idle" }
  | { phase: "countdown"; secondsLeft: number }
  | { phase: "ready" }
  | { phase: "awaiting_payment" }
  | { phase: "submitting" }
  | { phase: "completed"; receipt: Receipt }
  | { phase: "error"; message: string; code?: CheckoutErrorCode }

export type CheckoutAction =
  | { type: "START_CONFIRM"; seconds?: number }
  | { type: "TICK" }
  | { type: "CANCEL_CONFIRM" }
  | { type: "CONFIRM" }
  | { type: "PAY_NO" }
  | { type: "PAY_YES" }
  | { type: "SUBMIT_SUCCESS"; receipt: Receipt }
  | { type: "SUBMIT_ERROR"; message: string; code?: CheckoutErrorCode }
  | { type: "RESET" }

export function initialCheckoutState(): CheckoutState {
  return { phase: "idle" }
}

/**
 * The confirmation flow:
 *
 *   idle ──START_CONFIRM──▶ countdown(3) ──TICK…──▶ ready
 *   ready ──CONFIRM──▶ awaiting_payment ──PAY_NO──▶ ready
 *                                        ──PAY_YES─▶ submitting ──▶ completed | error
 *
 * `RESET` always returns to `idle` (start of a new sale).
 */
export function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    case "START_CONFIRM": {
      if (
        state.phase === "countdown" ||
        state.phase === "awaiting_payment" ||
        state.phase === "submitting" ||
        state.phase === "completed"
      ) {
        return state
      }
      const seconds = action.seconds ?? COUNTDOWN_SECONDS
      return seconds > 0 ? { phase: "countdown", secondsLeft: seconds } : { phase: "ready" }
    }

    case "TICK": {
      if (state.phase !== "countdown") return state
      const secondsLeft = state.secondsLeft - 1
      return secondsLeft > 0 ? { phase: "countdown", secondsLeft } : { phase: "ready" }
    }

    case "CANCEL_CONFIRM":
      return state.phase === "countdown" ? { phase: "idle" } : state

    case "CONFIRM":
      // Only reachable once the countdown has finished — never before.
      return state.phase === "ready" ? { phase: "awaiting_payment" } : state

    case "PAY_NO":
      // Customer did not pay: back to the Confirm state, nothing recorded.
      return state.phase === "awaiting_payment" ? { phase: "ready" } : state

    case "PAY_YES":
      return state.phase === "awaiting_payment" ? { phase: "submitting" } : state

    case "SUBMIT_SUCCESS":
      return state.phase === "submitting" ? { phase: "completed", receipt: action.receipt } : state

    case "SUBMIT_ERROR":
      return state.phase === "submitting"
        ? { phase: "error", message: action.message, code: action.code }
        : state

    case "RESET":
      return { phase: "idle" }

    default:
      return state
  }
}

/** True while the Confirm button must stay disabled. */
export function isConfirmLocked(state: CheckoutState): boolean {
  return state.phase === "countdown" || state.phase === "submitting" || state.phase === "completed"
}

/** True while a request is in flight (every action must be disabled). */
export function isSubmitting(state: CheckoutState): boolean {
  return state.phase === "submitting"
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Idempotency key for one checkout attempt (crypto.randomUUID when available). */
export function newClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Status code the API should answer with for a given domain error. */
export function statusForErrorCode(code: CheckoutErrorCode): number {
  switch (code) {
    case "STORE_NOT_FOUND":
    case "PRODUCT_NOT_FOUND":
      return 404
    case "PRODUCT_UNAVAILABLE":
    case "INSUFFICIENT_STOCK":
      return 409
    default:
      return 400
  }
}

