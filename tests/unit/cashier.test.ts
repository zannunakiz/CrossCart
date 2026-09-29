/**
 * Unit tests — QuickStore cashier domain logic (pure, mocked, no DB).
 *
 * Covers: money math in integer cents, price/stock input parsing, quantity +
 * stock availability rules (incl. "adding above stock"), search ranking,
 * cart helpers and the checkout confirmation state machine.
 */
import {
  MAX_QTY_PER_LINE,
  PRICE_MAX_DIGITS,
  addLine,
  availabilityLabel,
  buildSaleLine,
  checkAvailability,
  clampQuantity,
  computeTotals,
  discountedUnitCents,
  formatCents,
  formatPriceInput,
  fromCents,
  initialCheckoutState,
  isConfirmLocked,
  isPriceInput,
  isSellable,
  isSubmitting,
  newClientRequestId,
  orderableUnits,
  parseQuantity,
  parseStockInput,
  priceDigits,
  priceToCents,
  rankItems,
  reconcileLines,
  removeLine,
  statusForErrorCode,
  toCents,
  updateLineQuantity,
  checkoutReducer,
  type CashierItem,
  type SaleLine,
} from "@/lib/quickstore/cashier"

function item(overrides: Partial<CashierItem> = {}): CashierItem {
  return {
    id: "item-1",
    name: "Apple",
    description: "Fresh fruit",
    price: "15000.00",
    available: true,
    stocks: null,
    discountPercent: 0,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Money
// ─────────────────────────────────────────────────────────────────────────────

describe("money (integer cents)", () => {
  test("toCents parses numeric(18,2) strings", () => {
    expect(toCents("12000.00")).toBe(1_200_000)
    expect(toCents("0.05")).toBe(5)
    expect(toCents("0")).toBe(0)
    expect(toCents(15)).toBe(1500)
  })

  test("toCents never explodes on garbage", () => {
    expect(toCents("abc")).toBe(0)
    expect(toCents("")).toBe(0)
    expect(toCents(Number.NaN)).toBe(0)
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0)
  })

  test("fromCents renders a fixed 2-decimal string", () => {
    expect(fromCents(5)).toBe("0.05")
    expect(fromCents(0)).toBe("0.00")
    expect(fromCents(123_456)).toBe("1234.56")
    expect(fromCents(-250)).toBe("-2.50")
    expect(fromCents(123.6)).toBe("1.24")
  })

  test("formatCents groups thousands for display", () => {
    expect(formatCents(100_000_000)).toBe("1.000.000")
    expect(formatCents(0)).toBe("0")
    expect(formatCents(450)).toBe("5")
  })

  test("discountedUnitCents applies and clamps the percent", () => {
    expect(discountedUnitCents(10_000, 10)).toBe(9000)
    expect(discountedUnitCents(10_000, 0)).toBe(10_000)
    expect(discountedUnitCents(10_000, 100)).toBe(0)
    // Out-of-range percents can never make money appear or disappear.
    expect(discountedUnitCents(10_000, -5)).toBe(10_000)
    expect(discountedUnitCents(10_000, 150)).toBe(0)
    expect(discountedUnitCents(333, 33)).toBe(223)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Price / stock input parsing
// ─────────────────────────────────────────────────────────────────────────────

describe("price input", () => {
  test("priceDigits keeps digits only and caps the length", () => {
    expect(priceDigits("Rp 1.500")).toBe("1500")
    expect(priceDigits("12ab34")).toBe("1234")
    expect(priceDigits("999999999999999")).toBe("999999999999") // PRICE_MAX_DIGITS = 12
    expect(priceDigits("")).toBe("")
    expect(PRICE_MAX_DIGITS).toBe(12)
  })

  test("formatPriceInput groups digits in threes", () => {
    expect(formatPriceInput("1000")).toBe("1.000")
    expect(formatPriceInput("500")).toBe("500")
    expect(formatPriceInput("1000000")).toBe("1.000.000")
    expect(formatPriceInput("")).toBe("")
    expect(formatPriceInput("abc")).toBe("")
  })

  test("priceToCents converts the grouped box value", () => {
    expect(priceToCents("1.500")).toBe(150_000)
    expect(priceToCents("1500")).toBe(150_000)
    expect(priceToCents("")).toBe(0)
    expect(priceToCents("abc")).toBe(0)
  })

  test("isPriceInput accepts grouped/flat integers only", () => {
    expect(isPriceInput("1500")).toBe(true)
    expect(isPriceInput("1.500")).toBe(true)
    expect(isPriceInput("1.000.000")).toBe(true)
    expect(isPriceInput(1500)).toBe(true)
    expect(isPriceInput("0")).toBe(true)
    // Rejected: wrong grouping, separators, signs, decimals, empty, too long.
    expect(isPriceInput("12.34")).toBe(false)
    expect(isPriceInput("1,500")).toBe(false)
    expect(isPriceInput("-500")).toBe(false)
    expect(isPriceInput("15.5")).toBe(false)
    expect(isPriceInput("")).toBe(false)
    expect(isPriceInput("   ")).toBe(false)
    expect(isPriceInput("1234567890123")).toBe(false) // 13 digits > 12
    expect(isPriceInput(null)).toBe(false)
    expect(isPriceInput(undefined)).toBe(false)
  })

  test("parseStockInput: blank = unlimited, 0-999 tracked, rest invalid", () => {
    expect(parseStockInput(null)).toBeNull()
    expect(parseStockInput(undefined)).toBeNull()
    expect(parseStockInput("")).toBeNull()
    expect(parseStockInput(0)).toBe(0)
    expect(parseStockInput("10")).toBe(10)
    expect(parseStockInput(999)).toBe(999)
    expect(parseStockInput(-1)).toBeUndefined()
    expect(parseStockInput(1000)).toBeUndefined()
    expect(parseStockInput("abc")).toBeUndefined()
    expect(parseStockInput(3.5)).toBeUndefined()
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// Quantity + stock availability ("adding above stocks")
// ─────────────────────────────────────────────────────────────────────────────

describe("quantity rules", () => {
  test("parseQuantity accepts positive whole numbers only", () => {
    expect(parseQuantity("5")).toBe(5)
    expect(parseQuantity(" 7 ")).toBe(7)
    expect(parseQuantity("0")).toBeNull()
    expect(parseQuantity("-2")).toBeNull()
    expect(parseQuantity("1.5")).toBeNull()
    expect(parseQuantity("abc")).toBeNull()
    expect(parseQuantity("")).toBeNull()
    expect(parseQuantity("1e3")).toBeNull()
  })

  test("clampQuantity never exceeds the per-line cap", () => {
    expect(clampQuantity(5000, item())).toBe(MAX_QTY_PER_LINE)
    expect(clampQuantity(999, item())).toBe(999)
  })

  test("clampQuantity clamps down to the available stock", () => {
    expect(clampQuantity(5, item({ stocks: 3 }))).toBe(3)
    expect(clampQuantity(2, item({ stocks: 0 }))).toBe(0)
  })

  test("clampQuantity recovers from invalid quantities", () => {
    expect(clampQuantity(0, item())).toBe(1)
    expect(clampQuantity(-4, item())).toBe(1)
    expect(clampQuantity(2.5, item())).toBe(1)
    expect(clampQuantity(Number.NaN, item())).toBe(1)
  })

  test("isSellable / orderableUnits", () => {
    expect(isSellable(item())).toBe(true) // unlimited stock
    expect(isSellable(item({ stocks: 0 }))).toBe(false)
    expect(isSellable(item({ available: false }))).toBe(false)
    expect(orderableUnits(item())).toBeNull() // null = unlimited
    expect(orderableUnits(item({ stocks: 7 }))).toBe(7)
    expect(orderableUnits(item({ available: false, stocks: 7 }))).toBe(0)
    expect(orderableUnits(item({ stocks: -3 }))).toBe(0)
  })

  test("checkAvailability walks every failure mode", () => {
    expect(checkAvailability(item(), 0).code).toBe("invalid_quantity")
    expect(checkAvailability(item(), 1.5).code).toBe("invalid_quantity")
    expect(checkAvailability(item(), -1).code).toBe("invalid_quantity")
    expect(checkAvailability(item(), 1000).code).toBe("over_limit")
    expect(checkAvailability(item({ available: false }), 1).code).toBe("unavailable")
    expect(checkAvailability(item({ stocks: 0 }), 1).code).toBe("out_of_stock")
    // Adding above the remaining stock is refused with the exact count.
    const short = checkAvailability(item({ stocks: 3 }), 4)
    expect(short.ok).toBe(false)
    expect(short.code).toBe("insufficient_stock")
    expect(short.orderable).toBe(3)
    expect(short.message).toContain("3")
    expect(checkAvailability(item({ stocks: 3 }), 3).ok).toBe(true)
    expect(checkAvailability(item(), 999).ok).toBe(true)
  })

  test("availabilityLabel maps codes to friendly text", () => {
    expect(availabilityLabel("invalid_quantity")).toBe("Invalid quantity")
    expect(availabilityLabel("over_limit")).toBe("Quantity too large")
    expect(availabilityLabel("unavailable")).toBe("Unavailable")
    expect(availabilityLabel("out_of_stock")).toBe("Out of stock")
    expect(availabilityLabel("insufficient_stock")).toBe("Not enough stock")
    expect(availabilityLabel("ok")).toBe("Available")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Search / autocomplete ranking
// ─────────────────────────────────────────────────────────────────────────────

describe("rankItems", () => {
  const catalog: CashierItem[] = [
    item({ id: "1", name: "Apple", description: "Red fruit" }),
    item({ id: "2", name: "Green Apple", description: "Crisp" }),
    item({ id: "3", name: "Big Chips", description: "Snack" }),
    item({ id: "4", name: "Chips", description: "Salted snack" }),
    item({ id: "5", name: "Doritos", description: "Nacho cheese" }),
    item({ id: "6", name: "Ananas", description: "Sweet pineapple" }),
    item({ id: "7", name: "Unavailable Thing", description: "", available: false }),
  ]

  test("exact/prefix/word-prefix ordering", () => {
    const ranked = rankItems(catalog, "chips")
    expect(ranked.map((r) => r.name)).toEqual(["Chips", "Big Chips"])
    const apples = rankItems(catalog, "app")
    expect(apples[0]?.name).toBe("Apple")
    expect(apples.map((r) => r.name)).toContain("Green Apple")
  })

  test("short queries never match mid-word (no 'candy' noise)", () => {
    // "pp" only exists inside "Apple" — a mid-word hit, refused for < 3 chars.
    expect(rankItems(catalog, "pp")).toEqual([])
    // Prefix-only short query: Apple, Ananas + Green Apple (word prefix).
    expect(rankItems(catalog, "a")).toHaveLength(3)
  })

  test("3+ char queries fall back to description and subsequence", () => {
    // Subsequence: "drts" still finds Doritos.
    expect(rankItems(catalog, "drts").map((r) => r.name)).toEqual(["Doritos"])
    // Description match.
    expect(rankItems(catalog, "pineapple").map((r) => r.name)).toEqual(["Ananas"])
  })

  test("empty query lists sellable items A→Z (unavailable last)", () => {
    const ranked = rankItems(catalog, "", 50)
    expect(ranked).toHaveLength(catalog.length)
    expect(ranked[ranked.length - 1]?.name).toBe("Unavailable Thing")
    expect(ranked[0]?.name).toBe("Ananas")
  })

  test("at equal score a sellable item outranks an unavailable one", () => {
    const list = [
      item({ id: "u", name: "Same", available: false }),
      item({ id: "s", name: "Same", available: true }),
    ]
    const ranked = rankItems(list, "same")
    expect(ranked.map((r) => r.id)).toEqual(["s", "u"])
  })

  test("limit is respected; default caps at MAX_SUGGESTIONS; limit <= 0 returns nothing", () => {
    expect(rankItems(catalog, "a", 2)).toHaveLength(2)
    expect(rankItems(catalog, "a", 0)).toEqual([])
    expect(rankItems(catalog, "", 50)).toHaveLength(catalog.length)
    expect(rankItems(catalog, "")).toHaveLength(3) // default limit = 3
  })

  test("non-matching query returns empty", () => {
    expect(rankItems(catalog, "zzzz")).toEqual([])
  })

// ─────────────────────────────────────────────────────────────────────────────
// Cart helpers — add / edit / reconcile
// ─────────────────────────────────────────────────────────────────────────────

describe("cart helpers", () => {
  test("buildSaleLine prices with the discount applied", () => {
    const line = buildSaleLine(item({ discountPercent: 10 }), 2)
    expect(line.unitPriceCents).toBe(1_500_000)
    expect(line.unitPricePaidCents).toBe(1_350_000)
    expect(line.lineDiscountCents).toBe(300_000)
    expect(line.lineTotalCents).toBe(2_700_000)
  })

  test("computeTotals sums subtotal / discount / total / units", () => {
    const lines = [
      buildSaleLine(item({ id: "a" }), 2),
      buildSaleLine(item({ id: "b", price: "500.00", discountPercent: 50 }), 1),
    ]
    const totals = computeTotals(lines)
    expect(totals.subtotalCents).toBe(2 * 1_500_000 + 50_000)
    expect(totals.discountTotalCents).toBe(25_000)
    expect(totals.totalCents).toBe(2 * 1_500_000 + 25_000)
    expect(totals.itemCount).toBe(3)
    expect(totals.lineCount).toBe(2)
    expect(totals.subtotalCents - totals.discountTotalCents).toBe(totals.totalCents)
  })

  test("addLine creates a new line and merges when the item is already in the cart", () => {
    const apple = item({ id: "a" })
    let cart: SaleLine[] = addLine([], apple, 2)
    expect(cart).toHaveLength(1)
    expect(cart[0]?.quantity).toBe(2)
    cart = addLine(cart, apple, 3)
    expect(cart).toHaveLength(1)
    expect(cart[0]?.quantity).toBe(5)
  })

  test("addLine clamps a quantity above the stock", () => {
    const scarce = item({ id: "a", stocks: 4 })
    const cart = addLine([], scarce, 10)
    expect(cart[0]?.quantity).toBe(4)
  })

  test("addLine treats an invalid quantity as 1 and never mutates the input", () => {
    const apple = item({ id: "a" })
    const before: SaleLine[] = []
    const after = addLine(before, apple, 0)
    expect(before).toEqual([])
    expect(after[0]?.quantity).toBe(1)
  })

  test("updateLineQuantity edits a line; <= 0 removes it", () => {
    const apple = item({ id: "a", stocks: 10 })
    const cart = addLine([], apple, 2)
    expect(updateLineQuantity(cart, apple, 5)[0]?.quantity).toBe(5)
    expect(updateLineQuantity(cart, apple, 99)[0]?.quantity).toBe(10) // clamped
    expect(updateLineQuantity(cart, apple, 0)).toEqual([])
    expect(updateLineQuantity(cart, apple, -1)).toEqual([])
    expect(updateLineQuantity(cart, apple, 1.5)).toEqual([])
  })

  test("removeLine drops exactly the requested item", () => {
    const cart = [buildSaleLine(item({ id: "a" }), 1), buildSaleLine(item({ id: "b" }), 1)]
    expect(removeLine(cart, "a").map((l) => l.itemId)).toEqual(["b"])
    expect(removeLine(cart, "missing")).toHaveLength(2)
  })

  test("reconcileLines merges duplicates, drops vanished items, re-prices to the catalog", () => {
    const a = item({ id: "a", stocks: 5 })
    const b = item({ id: "b" })
    const stale = buildSaleLine(item({ id: "a", price: "1000.00" }), 3)
    const stale2 = buildSaleLine(item({ id: "a", price: "1000.00" }), 3)
    const gone = buildSaleLine(item({ id: "zz", name: "Gone" }), 1)
    const reconciled = reconcileLines([stale, stale2, gone], [a, b])
    expect(reconciled).toHaveLength(1)
    expect(reconciled[0]?.quantity).toBe(5) // 3+3 clamped to stock 5
    expect(reconciled[0]?.unitPriceCents).toBe(1_500_000) // re-priced from catalog
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// Checkout confirmation state machine
// ─────────────────────────────────────────────────────────────────────────────

describe("checkoutReducer", () => {
  const receipt = {
    id: "r1",
    storeId: "s1",
    receiptNumber: "QS-20260929-ABCDEF",
    status: "completed" as const,
    subtotal: "15000.00",
    discountTotal: "0.00",
    total: "15000.00",
    itemCount: 1,
    lineCount: 1,
    note: null,
    cashierId: "u1",
    paidAt: "2026-09-29T00:00:00.000Z",
    createdAt: "2026-09-29T00:00:00.000Z",
    lines: [],
  }

  test("starts idle", () => {
    expect(initialCheckoutState()).toEqual({ phase: "idle" })
  })

  test("happy path: idle → countdown → ready → awaiting_payment → submitting → completed", () => {
    let state = initialCheckoutState()
    state = checkoutReducer(state, { type: "START_CONFIRM" })
    expect(state).toEqual({ phase: "countdown", secondsLeft: 3 })
    state = checkoutReducer(state, { type: "TICK" })
    state = checkoutReducer(state, { type: "TICK" })
    expect(state).toEqual({ phase: "countdown", secondsLeft: 1 })
    state = checkoutReducer(state, { type: "TICK" })
    expect(state).toEqual({ phase: "ready" })
    state = checkoutReducer(state, { type: "CONFIRM" })
    expect(state).toEqual({ phase: "awaiting_payment" })
    state = checkoutReducer(state, { type: "PAY_YES" })
    expect(state).toEqual({ phase: "submitting" })
    state = checkoutReducer(state, { type: "SUBMIT_SUCCESS", receipt })
    expect(state).toEqual({ phase: "completed", receipt })
  })

  test("START_CONFIRM with 0 seconds jumps straight to ready", () => {
    expect(checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM", seconds: 0 })).toEqual({
      phase: "ready",
    })
  })

  test("no double countdown while one is running", () => {
    const counting = checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM" })
    expect(checkoutReducer(counting, { type: "START_CONFIRM" })).toBe(counting)
  })

  test("CANCEL_CONFIRM aborts only the countdown", () => {
    const counting = checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM" })
    expect(checkoutReducer(counting, { type: "CANCEL_CONFIRM" })).toEqual({ phase: "idle" })
    const ready = checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM", seconds: 0 })
    expect(checkoutReducer(ready, { type: "CANCEL_CONFIRM" })).toBe(ready)
  })

  test("CONFIRM is impossible before the countdown finishes", () => {
    expect(checkoutReducer(initialCheckoutState(), { type: "CONFIRM" })).toEqual({ phase: "idle" })
    const counting = checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM" })
    expect(checkoutReducer(counting, { type: "CONFIRM" })).toBe(counting)
  })

  test("customer declines payment → back to ready, nothing recorded", () => {
    const awaiting = checkoutReducer(
      checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM", seconds: 0 }),
      { type: "CONFIRM" }
    )
    expect(checkoutReducer(awaiting, { type: "PAY_NO" })).toEqual({ phase: "ready" })
  })

  test("PAY_YES only works from awaiting_payment", () => {
    expect(checkoutReducer(initialCheckoutState(), { type: "PAY_YES" })).toEqual({ phase: "idle" })
    const ready = checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM", seconds: 0 })
    expect(checkoutReducer(ready, { type: "PAY_YES" })).toBe(ready)
  })

  test("submit results are ignored outside of submitting", () => {
    expect(checkoutReducer(initialCheckoutState(), { type: "SUBMIT_SUCCESS", receipt })).toEqual({
      phase: "idle",
    })
    expect(
      checkoutReducer(initialCheckoutState(), { type: "SUBMIT_ERROR", message: "boom" })
    ).toEqual({ phase: "idle" })
  })

  test("submit failure surfaces the domain error code", () => {
    const submitting = checkoutReducer(
      checkoutReducer(
        checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM", seconds: 0 }),
        { type: "CONFIRM" }
      ),
      { type: "PAY_YES" }
    )
    expect(
      checkoutReducer(submitting, {
        type: "SUBMIT_ERROR",
        message: "Not enough stock",
        code: "INSUFFICIENT_STOCK",
      })
    ).toEqual({ phase: "error", message: "Not enough stock", code: "INSUFFICIENT_STOCK" })
  })

  test("RESET always returns to idle (start of a new sale)", () => {
    expect(checkoutReducer({ phase: "error", message: "x" }, { type: "RESET" })).toEqual({
      phase: "idle",
    })
    expect(checkoutReducer({ phase: "completed", receipt }, { type: "RESET" })).toEqual({
      phase: "idle",
    })
  })

  test("isConfirmLocked / isSubmitting track the guarded phases", () => {
    expect(isConfirmLocked(initialCheckoutState())).toBe(false)
    expect(
      isConfirmLocked(checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM" }))
    ).toBe(true)
    const submitting = checkoutReducer(
      checkoutReducer(
        checkoutReducer(initialCheckoutState(), { type: "START_CONFIRM", seconds: 0 }),
        { type: "CONFIRM" }
      ),
      { type: "PAY_YES" }
    )
    expect(isConfirmLocked(submitting)).toBe(true)
    expect(isSubmitting(submitting)).toBe(true)
    expect(isConfirmLocked({ phase: "completed", receipt })).toBe(true)
    expect(isSubmitting({ phase: "completed", receipt })).toBe(false)
    expect(isSubmitting(initialCheckoutState())).toBe(false)
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────────────

describe("misc helpers", () => {
  test("statusForErrorCode maps domain errors to HTTP statuses", () => {
    expect(statusForErrorCode("STORE_NOT_FOUND")).toBe(404)
    expect(statusForErrorCode("PRODUCT_NOT_FOUND")).toBe(404)
    expect(statusForErrorCode("PRODUCT_UNAVAILABLE")).toBe(409)
    expect(statusForErrorCode("INSUFFICIENT_STOCK")).toBe(409)
    expect(statusForErrorCode("EMPTY_CART")).toBe(400)
    expect(statusForErrorCode("INVALID_REQUEST")).toBe(400)
    expect(statusForErrorCode("INVALID_QUANTITY")).toBe(400)
    expect(statusForErrorCode("TOO_MANY_LINES")).toBe(400)
  })

  test("newClientRequestId produces unique non-empty ids", () => {
    const a = newClientRequestId()
    const b = newClientRequestId()
    expect(a.length).toBeGreaterThanOrEqual(8)
    expect(a).not.toBe(b)
  })
})

})
