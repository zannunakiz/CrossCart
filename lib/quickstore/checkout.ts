/**
 * QuickStore Cashier — server-side checkout orchestration.
 *
 * This module owns the *rules* of recording a sale; the actual SQL lives behind
 * the small `CheckoutTx` port implemented by `checkout-drizzle.ts`. That split
 * keeps the whole flow (idempotency, stock validation, rollback, receipt
 * numbering) unit testable with an in-memory fake instead of a database.
 *
 * Guarantees:
 *   - prices, discounts and totals are always recomputed from the DB
 *   - stock can never go negative (locked rows + conditional decrement)
 *   - history + stock move atomically (single transaction, rollback on failure)
 *   - a repeated `clientRequestId` returns the original receipt, never a duplicate
 */
import type { CurrencyType } from "@/lib/db/schema"
import {
  MAX_LINES,
  MAX_QTY_PER_LINE,
  discountedUnitCents,
  statusForErrorCode,
  toCents,
  type CheckoutErrorCode,
  type CheckoutIssue,
  type Receipt,
} from "@/lib/quickstore/cashier"

/**
 * Currency recorded on a sale. Items no longer carry one (the catalog is
 * single-currency), but the history column is kept for the stored receipts.
 */
const SALE_CURRENCY: CurrencyType = "IDR"

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode
  readonly issues: CheckoutIssue[]

  constructor(code: CheckoutErrorCode, message: string, issues: CheckoutIssue[] = []) {
    super(message)
    this.name = "CheckoutError"
    this.code = code
    this.issues = issues
  }

  /** HTTP status the API should answer with. */
  get status(): number {
    return statusForErrorCode(this.code)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ports (implemented by checkout-drizzle.ts, faked in tests)
// ─────────────────────────────────────────────────────────────────────────────

/** A product row locked for update inside the checkout transaction. */
export interface LockedItem {
  id: string
  name: string
  price: string
  available: boolean
  /** null = unlimited stock. */
  stocks: number | null
  discountPercent: number
}

export interface SaleHeaderInput {
  storeId: string
  cashierId: string
  /**
   * Display-name snapshot. Receipts keep showing who sold what even after the
   * operator deletes their account (the `cashier_id` FK then becomes null).
   */
  cashierName: string | null
  receiptNumber: string
  currency: CurrencyType
  subtotal: string
  discountTotal: string
  total: string
  lineCount: number
  itemCount: number
  note: string | null
  clientRequestId: string
  paidAt: Date
}

export interface SaleLineInput {
  itemId: string
  name: string
  unitPrice: string
  discountPercent: number
  unitPricePaid: string
  quantity: number
  lineTotal: string
  /** Receipt order (matches the cashier's cart). */
  position: number
}

export interface StockMovementResult {
  itemId: string
  /** false when the conditional decrement found insufficient stock. */
  ok: boolean
}

export interface CheckoutTx {
  /** `SELECT … FOR UPDATE` on the requested items (deterministic order). */
  lockItems(storeId: string, itemIds: string[]): Promise<LockedItem[]>
  /** Idempotency lookup — returns the receipt already stored for this key. */
  findReceiptByRequestId(storeId: string, clientRequestId: string): Promise<Receipt | null>
  insertReceipt(values: SaleHeaderInput): Promise<{ id: string }>
  insertReceiptLines(receiptId: string, lines: SaleLineInput[]): Promise<void>
  /** Conditional `stocks = stocks - qty` + `purchased_amount = purchased_amount + qty`. */
  applyStockMovement(moves: { itemId: string; quantity: number }[]): Promise<StockMovementResult[]>
  loadReceipt(receiptId: string): Promise<Receipt | null>
}

export interface CheckoutAccess {
  withTransaction<T>(fn: (tx: CheckoutTx) => Promise<T>): Promise<T>
}

export interface CheckoutInput {
  storeId: string
  cashierId: string
  /** Optional display-name snapshot of the cashier (see `SaleHeaderInput`). */
  cashierName?: string | null
  clientRequestId: string
  lines: { itemId: string; quantity: number }[]
  note?: string | null
}

export interface CheckoutResult {
  receipt: Receipt
  /** True when this request replayed an already recorded sale. */
  reused: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Merge duplicated itemIds, keeping the order of first appearance. */
export function mergeRequestedLines(
  lines: readonly { itemId: string; quantity: number }[]
): { itemId: string; quantity: number }[] {
  const merged = new Map<string, number>()
  for (const line of lines) {
    merged.set(line.itemId, (merged.get(line.itemId) ?? 0) + line.quantity)
  }
  return [...merged.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))
}

/** Random 6-char suffix; the unique index turns any clash into a retry. */
function randomSuffix(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 6)
  }
  return Math.random().toString(36).slice(2, 8)
}

/** Human readable receipt number: QS-20260926-7F3K1A. */
export function buildReceiptNumber(now: Date, suffix: string = randomSuffix()): string {
  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("")
  return `QS-${date}-${suffix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}`
}

/** Postgres unique-violation detection (receipt number / idempotency clash). */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const err = error as { code?: unknown; cause?: unknown }
  if (err.code === "23505") return true
  return err.cause ? isUniqueViolation(err.cause) : false
}

const RECEIPT_NUMBER_ATTEMPTS = 3

/**
 * Validate + normalise a raw request before it touches the database.
 * Throws `CheckoutError` for anything the caller got wrong.
 */
export function normalizeCheckoutInput(input: CheckoutInput) {
  if (!input.clientRequestId || input.clientRequestId.trim().length < 8) {
    throw new CheckoutError(
      "INVALID_REQUEST",
      "A client request id (min 8 characters) is required to record a sale"
    )
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new CheckoutError("EMPTY_CART", "Add at least one product before checking out")
  }
  if (input.lines.length > MAX_LINES) {
    throw new CheckoutError("TOO_MANY_LINES", `A single sale is limited to ${MAX_LINES} lines`)
  }

  const merged = mergeRequestedLines(input.lines)

  const invalid = merged.find(
    (line) =>
      typeof line.itemId !== "string" ||
      line.itemId.length === 0 ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QTY_PER_LINE
  )
  if (invalid) {
    throw new CheckoutError(
      "INVALID_QUANTITY",
      `Every quantity must be a whole number from 1 to ${MAX_QTY_PER_LINE}`,
      [
        {
          itemId: String(invalid.itemId ?? ""),
          code: "INVALID_QUANTITY",
          message: `Quantity must be a whole number from 1 to ${MAX_QTY_PER_LINE}`,
          requested: Number(invalid.quantity),
        },
      ]
    )
  }

  const note = input.note?.trim()
  return {
    clientRequestId: input.clientRequestId.trim(),
    note: note ? note.slice(0, 140) : null,
    lines: merged,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation of the locked rows
// ─────────────────────────────────────────────────────────────────────────────

export interface PreparedLine {
  itemId: string
  name: string
  unitPrice: string
  unitPricePaid: string
  discountPercent: number
  quantity: number
  lineTotal: string
  lineTotalCents: number
  unitPriceCents: number
  unitPricePaidCents: number
}

/**
 * Turn locked product rows + requested quantities into priced lines.
 * Throws a `CheckoutError` describing EVERY problem found, so the cashier sees
 * all offending rows at once instead of fixing them one by one.
 */
export function prepareCheckoutLines(
  locked: readonly LockedItem[],
  requested: readonly { itemId: string; quantity: number }[]
): PreparedLine[] {
  const byId = new Map(locked.map((item) => [item.id, item]))

  const missing: CheckoutIssue[] = []
  const unavailable: CheckoutIssue[] = []
  const insufficient: CheckoutIssue[] = []

  const prepared: PreparedLine[] = []

  for (const line of requested) {
    const item = byId.get(line.itemId)
    if (!item) {
      missing.push({
        itemId: line.itemId,
        code: "PRODUCT_NOT_FOUND",
        message: "This product no longer exists in the store",
        requested: line.quantity,
      })
      continue
    }

    if (!item.available) {
      unavailable.push({
        itemId: item.id,
        name: item.name,
        code: "PRODUCT_UNAVAILABLE",
        message: `${item.name} is currently unavailable`,
        requested: line.quantity,
      })
      continue
    }

    const stocks = item.stocks
    if (stocks != null && stocks < line.quantity) {
      insufficient.push({
        itemId: item.id,
        name: item.name,
        code: "INSUFFICIENT_STOCK",
        message: stocks <= 0 ? `${item.name} is out of stock` : `Only ${stocks} ${item.name} left`,
        available: stocks,
        requested: line.quantity,
      })
      continue
    }

    const unitPriceCents = toCents(item.price)
    const discountPercent = Math.min(Math.max(item.discountPercent ?? 0, 0), 100)
    const unitPricePaidCents = discountedUnitCents(unitPriceCents, discountPercent)

    prepared.push({
      itemId: item.id,
      name: item.name,
      unitPrice: (unitPriceCents / 100).toFixed(2),
      unitPricePaid: (unitPricePaidCents / 100).toFixed(2),
      discountPercent,
      quantity: line.quantity,
      lineTotal: ((unitPricePaidCents * line.quantity) / 100).toFixed(2),
      lineTotalCents: unitPricePaidCents * line.quantity,
      unitPriceCents,
      unitPricePaidCents,
    })
  }

  if (missing.length > 0) {
    throw new CheckoutError(
      "PRODUCT_NOT_FOUND",
      missing.length === 1
        ? "One product in the cart no longer exists"
        : `${missing.length} products in the cart no longer exist`,
      missing
    )
  }
  if (unavailable.length > 0) {
    throw new CheckoutError(
      "PRODUCT_UNAVAILABLE",
      unavailable.map((issue) => issue.message).join(", "),
      unavailable
    )
  }
  if (insufficient.length > 0) {
    throw new CheckoutError(
      "INSUFFICIENT_STOCK",
      insufficient.map((issue) => issue.message).join(", "),
      insufficient
    )
  }

  return prepared
}

export interface PreparedTotals {
  subtotalCents: number
  discountTotalCents: number
  totalCents: number
  itemCount: number
  lineCount: number
}

/** Totals in integer cents, derived from the prepared lines. */
export function totalPreparedLines(lines: readonly PreparedLine[]): PreparedTotals {
  let subtotalCents = 0
  let discountTotalCents = 0
  let totalCents = 0
  let itemCount = 0

  for (const line of lines) {
    subtotalCents += line.unitPriceCents * line.quantity
    discountTotalCents += (line.unitPriceCents - line.unitPricePaidCents) * line.quantity
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
// performCheckout — the single entry point used by the API route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a sale.
 *
 * Everything happens inside one transaction:
 *   1. replay check (`clientRequestId`) — returns the original receipt
 *   2. lock the requested product rows (FOR UPDATE, deterministic order)
 *   3. validate existence / availability / stock / currency
 *   4. insert the history header + snapshot lines
 *   5. conditionally decrement stock and bump `purchased_amount`
 *
 * Any failure rolls the whole thing back, so history and stock can never
 * disagree.
 */
export async function performCheckout(
  access: CheckoutAccess,
  input: CheckoutInput,
  now: Date = new Date()
): Promise<CheckoutResult> {
  const normalized = normalizeCheckoutInput(input)

  return access.withTransaction(async (tx) => {
    // ── 1. Idempotency: a retried/double-clicked request replays the sale ──
    const existing = await tx.findReceiptByRequestId(
      input.storeId,
      normalized.clientRequestId
    )
    if (existing) {
      return { receipt: existing, reused: true }
    }

    // ── 2. Lock the products (sorted ids keep concurrent sales deadlock-free) ──
    const itemIds = normalized.lines.map((line) => line.itemId).sort()
    const locked = await tx.lockItems(input.storeId, itemIds)

    // ── 3. Validate + price ──
    const lines = prepareCheckoutLines(locked, normalized.lines)
    const totals = totalPreparedLines(lines)

    // ── 4. History header + snapshot lines ──
    const header = {
      storeId: input.storeId,
      cashierId: input.cashierId,
      cashierName: input.cashierName ?? null,
      currency: SALE_CURRENCY,
      subtotal: (totals.subtotalCents / 100).toFixed(2),
      discountTotal: (totals.discountTotalCents / 100).toFixed(2),
      total: (totals.totalCents / 100).toFixed(2),
      lineCount: totals.lineCount,
      itemCount: totals.itemCount,
      note: normalized.note,
      clientRequestId: normalized.clientRequestId,
      paidAt: now,
    }

    let receiptId: string | null = null
    for (let attempt = 0; attempt < RECEIPT_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        const inserted = await tx.insertReceipt({
          ...header,
          receiptNumber: buildReceiptNumber(now),
        })
        receiptId = inserted.id
        break
      } catch (error) {
        // Receipt number collision: retry with a fresh suffix.
        if (isUniqueViolation(error) && attempt < RECEIPT_NUMBER_ATTEMPTS - 1) continue
        throw error
      }
    }
    if (!receiptId) {
      throw new CheckoutError("STORE_NOT_FOUND", "Could not allocate a receipt number")
    }

    await tx.insertReceiptLines(
      receiptId,
      lines.map((line, index) => ({
        itemId: line.itemId,
        name: line.name,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        unitPricePaid: line.unitPricePaid,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        position: index,
      }))
    )

    // ── 5. Stock movement (conditional — defends against non-locking writers) ──
    const movements = await tx.applyStockMovement(
      lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity }))
    )
    const failed = movements.filter((movement) => !movement.ok)
    if (failed.length > 0) {
      const issues: CheckoutIssue[] = failed.map((movement) => {
        const line = lines.find((candidate) => candidate.itemId === movement.itemId)
        return {
          itemId: movement.itemId,
          name: line?.name,
          code: "INSUFFICIENT_STOCK",
          message: line ? `${line.name} just sold out — remove it or lower the quantity` : "Insufficient stock",
          requested: line?.quantity,
        }
      })
      // Throwing rolls the transaction back: no history row, no stock change.
      throw new CheckoutError("INSUFFICIENT_STOCK", issues.map((i) => i.message).join(", "), issues)
    }

    const receipt = await tx.loadReceipt(receiptId)
    if (!receipt) {
      throw new CheckoutError("STORE_NOT_FOUND", "Sale could not be reloaded after recording")
    }

    return { receipt, reused: false }
  })
}

