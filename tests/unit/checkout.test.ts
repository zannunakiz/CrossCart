/**
 * Unit tests — QuickStore checkout orchestration (`performCheckout`).
 *
 * The SQL lives behind the `CheckoutTx` port, so the whole flow — validation,
 * pricing, idempotency, stock movement, receipt numbering — runs here against
 * an in-memory fake. No database, no network, pure mocks.
 */
import {
  CheckoutError,
  buildReceiptNumber,
  isUniqueViolation,
  mergeRequestedLines,
  normalizeCheckoutInput,
  performCheckout,
  prepareCheckoutLines,
  totalPreparedLines,
  type CheckoutAccess,
  type CheckoutTx,
  type LockedItem,
  type SaleHeaderInput,
  type SaleLineInput,
} from "@/lib/quickstore/checkout"
import type { Receipt } from "@/lib/quickstore/cashier"

// ─────────────────────────────────────────────────────────────────────────────
// In-memory fake of the database port
// ─────────────────────────────────────────────────────────────────────────────

interface FakeState {
  lockCalls: { storeId: string; itemIds: string[] }[]
  insertAttempts: number
  header: SaleHeaderInput | null
  lines: SaleLineInput[] | null
}

interface FakeOptions {
  /** Receipt already stored for the idempotency key. */
  existing?: Receipt | null
  /** Fail the FIRST insertReceipt with a unique violation (number collision). */
  failFirstInsert?: boolean
  /** Always fail insertReceipt with a unique violation. */
  failEveryInsert?: boolean
  /** Overrides for applyStockMovement results (defaults to "all ok"). */
  movements?: { itemId: string; ok: boolean }[]
  /** Make loadReceipt return null (receipt vanished after insert). */
  dropReceipt?: boolean
}

function fakeReceipt(header: SaleHeaderInput, lines: SaleLineInput[], id: string): Receipt {
  return {
    id,
    storeId: header.storeId,
    receiptNumber: header.receiptNumber,
    status: "completed",
    subtotal: header.subtotal,
    discountTotal: header.discountTotal,
    total: header.total,
    itemCount: header.itemCount,
    lineCount: header.lineCount,
    note: header.note,
    cashierId: header.cashierId,
    cashierName: header.cashierName,
    paidAt: header.paidAt.toISOString(),
    createdAt: header.paidAt.toISOString(),
    lines: lines.map((line, index) => ({ id: `${id}-l${index}`, ...line })),
  }
}

function makeFakeAccess(items: LockedItem[], options: FakeOptions = {}) {
  const state: FakeState = { lockCalls: [], insertAttempts: 0, header: null, lines: null }

  const tx: CheckoutTx = {
    lockItems: jest.fn(async (storeId: string, itemIds: string[]) => {
      state.lockCalls.push({ storeId, itemIds })
      const wanted = new Set(itemIds)
      return items.filter((item) => wanted.has(item.id))
    }),
    findReceiptByRequestId: jest.fn(async () => options.existing ?? null),
    insertReceipt: jest.fn(async (values: SaleHeaderInput) => {
      state.insertAttempts += 1
      if (options.failEveryInsert || (options.failFirstInsert && state.insertAttempts === 1)) {
        throw { code: "23505" } // Postgres unique_violation
      }
      state.header = values
      return { id: `receipt-${state.insertAttempts}` }
    }),
    insertReceiptLines: jest.fn(async (_receiptId: string, lines: SaleLineInput[]) => {
      state.lines = [...lines]
    }),
    applyStockMovement: jest.fn(
      async (moves: { itemId: string; quantity: number }[]) =>
        options.movements ?? moves.map((move) => ({ itemId: move.itemId, ok: true }))
    ),
    loadReceipt: jest.fn(async (receiptId: string) => {
      if (options.dropReceipt || !state.header || !state.lines) return null
      return fakeReceipt(state.header, state.lines, receiptId)
    }),
  }

  const access: CheckoutAccess = {
    async withTransaction(fn) {
      // Mirrors drizzle: an error thrown inside rolls everything back — the
      // fake simply lets it propagate, so callers observe the same failure.
      return fn(tx)
    },
  }

  return { access, tx, state }
}

function locked(overrides: Partial<LockedItem> = {}): LockedItem {
  return {
    id: "item-a",
    name: "Apple",
    price: "15000.00",
    available: true,
    stocks: null,
    discountPercent: 0,
    ...overrides,
  }
}

const NOW = new Date(Date.UTC(2026, 8, 29, 10, 0, 0))
const baseInput = {
  storeId: "11111111-2222-4333-8444-555555555555",
  cashierId: "user-1",
  cashierName: "Kasir Satu",
  clientRequestId: "req-abcdef12",
  lines: [{ itemId: "item-a", quantity: 2 }],
}

// ─────────────────────────────────────────────────────────────────────────────
// Input normalisation
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeCheckoutInput", () => {
  test("merges duplicated itemIds (double-tapped + button)", () => {
    expect(
      mergeRequestedLines([
        { itemId: "a", quantity: 1 },
        { itemId: "b", quantity: 2 },
        { itemId: "a", quantity: 3 },
      ])
    ).toEqual([
      { itemId: "a", quantity: 4 },
      { itemId: "b", quantity: 2 },
    ])
  })

  test("refuses a missing / too-short idempotency key", () => {
    expect(() => normalizeCheckoutInput({ ...baseInput, clientRequestId: "" })).toThrow(
      CheckoutError
    )
    try {
      normalizeCheckoutInput({ ...baseInput, clientRequestId: "short" })
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({ name: "CheckoutError", code: "INVALID_REQUEST", status: 400 })
    }
  })

  test("refuses an empty cart / non-array lines", () => {
    try {
      normalizeCheckoutInput({ ...baseInput, lines: [] })
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({ code: "EMPTY_CART", status: 400 })
    }
    try {
      normalizeCheckoutInput({ ...baseInput, lines: undefined as never })
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({ code: "EMPTY_CART" })
    }
  })

  test("refuses more than MAX_LINES distinct lines", () => {
    const lines = Array.from({ length: 51 }, (_, index) => ({ itemId: `i${index}`, quantity: 1 }))
    try {
      normalizeCheckoutInput({ ...baseInput, lines })
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({ code: "TOO_MANY_LINES", status: 400 })
    }
  })

  test("refuses quantities that are not whole numbers within 1..999", () => {
    for (const quantity of [0, -1, 1.5, 1000]) {
      try {
        normalizeCheckoutInput({ ...baseInput, lines: [{ itemId: "a", quantity }] })
        throw new Error(`should have thrown for ${quantity}`)
      } catch (error) {
        expect(error).toMatchObject({ code: "INVALID_QUANTITY", status: 400 })
      }
    }
  })

  test("an invalid quantity carries a per-line issue for the UI", () => {
    try {
      normalizeCheckoutInput({ ...baseInput, lines: [{ itemId: "item-a", quantity: 0 }] })
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(CheckoutError)
      const checkoutError = error as CheckoutError
      expect(checkoutError.issues).toHaveLength(1)
      expect(checkoutError.issues[0]).toMatchObject({ itemId: "item-a", code: "INVALID_QUANTITY" })
    }
  })

  test("trims the request id and caps the note at 140 chars", () => {
    const normalized = normalizeCheckoutInput({
      ...baseInput,
      clientRequestId: "  req-abcdef12  ",
      note: `  ${"x".repeat(500)}  `,
    })
    expect(normalized.clientRequestId).toBe("req-abcdef12")
    expect(normalized.note).toHaveLength(140)
    const blank = normalizeCheckoutInput({ ...baseInput, note: "   " })
    expect(blank.note).toBeNull()
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// Validation + pricing of the locked rows
// ─────────────────────────────────────────────────────────────────────────────

describe("prepareCheckoutLines", () => {
  test("prices a line with the stored discount, server-side", () => {
    const lines = prepareCheckoutLines([locked({ discountPercent: 10 })], [
      { itemId: "item-a", quantity: 2 },
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      unitPrice: "15000.00",
      unitPricePaid: "13500.00",
      discountPercent: 10,
      quantity: 2,
      lineTotal: "27000.00",
      lineTotalCents: 2_700_000,
      unitPriceCents: 1_500_000,
      unitPricePaidCents: 1_350_000,
    })
  })

  test("an out-of-range discount is clamped into 0..100", () => {
    const tooLow = prepareCheckoutLines([locked({ discountPercent: -5 })], [
      { itemId: "item-a", quantity: 1 },
    ])
    expect(tooLow[0]?.discountPercent).toBe(0)
    const tooHigh = prepareCheckoutLines([locked({ discountPercent: 150 })], [
      { itemId: "item-a", quantity: 1 },
    ])
    expect(tooHigh[0]?.discountPercent).toBe(100)
    expect(tooHigh[0]?.unitPricePaidCents).toBe(0) // 100% off = free
  })

  test("a product that vanished from the catalog is reported", () => {
    try {
      prepareCheckoutLines([], [{ itemId: "ghost", quantity: 1 }])
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({
        code: "PRODUCT_NOT_FOUND",
        status: 404,
        issues: [{ itemId: "ghost", code: "PRODUCT_NOT_FOUND" }],
      })
    }
  })

  test("an unavailable product is reported with its name", () => {
    try {
      prepareCheckoutLines([locked({ available: false })], [{ itemId: "item-a", quantity: 1 }])
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({ code: "PRODUCT_UNAVAILABLE", status: 409 })
      const issues = (error as CheckoutError).issues
      expect(issues[0]?.name).toBe("Apple")
      expect(issues[0]?.message).toContain("unavailable")
    }
  })

  test("buying above the stock is refused, out-of-stock says so", () => {
    try {
      prepareCheckoutLines([locked({ stocks: 3 })], [{ itemId: "item-a", quantity: 4 }])
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({ code: "INSUFFICIENT_STOCK", status: 409 })
      const issues = (error as CheckoutError).issues
      expect(issues[0]).toMatchObject({ available: 3, requested: 4 })
      expect(issues[0]?.message).toContain("Only 3")
    }
    try {
      prepareCheckoutLines([locked({ stocks: 0 })], [{ itemId: "item-a", quantity: 1 }])
      throw new Error("should have thrown")
    } catch (error) {
      expect((error as CheckoutError).issues[0]?.message).toContain("out of stock")
    }
    // Buying EXACTLY the remaining stock is allowed.
    expect(
      prepareCheckoutLines([locked({ stocks: 3 })], [{ itemId: "item-a", quantity: 3 }])
    ).toHaveLength(1)
    // Unlimited stock (null) never fails.
    expect(
      prepareCheckoutLines([locked({ stocks: null })], [{ itemId: "item-a", quantity: 999 }])
    ).toHaveLength(1)
  })

  test("missing beats unavailable beats insufficient when several problems coexist", () => {
    const rows = [locked({ available: false }), locked({ id: "item-b", stocks: 1 })]
    try {
      prepareCheckoutLines(rows, [
        { itemId: "ghost", quantity: 1 },
        { itemId: "item-a", quantity: 1 },
        { itemId: "item-b", quantity: 5 },
      ])
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toMatchObject({ code: "PRODUCT_NOT_FOUND" })
    }
  })
})

describe("totalPreparedLines", () => {
  test("sums subtotal / discount / total / units across lines", () => {
    const lines = prepareCheckoutLines(
      [locked({ id: "a", discountPercent: 10 }), locked({ id: "b", price: "500.00" })],
      [
        { itemId: "a", quantity: 2 },
        { itemId: "b", quantity: 1 },
      ]
    )
    const totals = totalPreparedLines(lines)
    expect(totals.subtotalCents).toBe(2 * 1_500_000 + 50_000)
    expect(totals.discountTotalCents).toBe(2 * 150_000)
    expect(totals.totalCents).toBe(2 * 1_350_000 + 50_000)
    expect(totals.itemCount).toBe(3)
    expect(totals.lineCount).toBe(2)
    expect(totals.subtotalCents - totals.discountTotalCents).toBe(totals.totalCents)
  })

  test("an empty cart totals zero", () => {
    expect(totalPreparedLines([])).toEqual({
      subtotalCents: 0,
      discountTotalCents: 0,
      totalCents: 0,
      itemCount: 0,
      lineCount: 0,
    })
  })
})

describe("receipt helpers", () => {
  test("buildReceiptNumber formats QS-YYYYMMDD-SUFFIX", () => {
    expect(buildReceiptNumber(NOW, "ab12cd")).toBe("QS-20260929-AB12CD")
    // Single-digit month/day are zero-padded; junk is stripped from the suffix.
    expect(buildReceiptNumber(new Date(Date.UTC(2026, 0, 5)), "!!abc-def")).toBe("QS-20260105-ABCDEF")
    expect(buildReceiptNumber(NOW, "toolongsuffix")).toBe("QS-20260929-TOOLON") // capped at 6
  })

  test("isUniqueViolation recognises code 23505, even nested in a cause chain", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true)
    expect(isUniqueViolation(new Error("boom"))).toBe(false)
    expect(isUniqueViolation({ code: "23503" })).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation("23505")).toBe(false)
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true)
    expect(isUniqueViolation({ cause: { cause: { code: "23505" } } })).toBe(true)
  })
})


// ─────────────────────────────────────────────────────────────────────────────
// performCheckout — the flow itself, over the fake port
// ─────────────────────────────────────────────────────────────────────────────

describe("performCheckout", () => {
  test("records a sale: totals computed server-side, lines positioned, stock moved", async () => {
    const { access, state } = makeFakeAccess([locked({ stocks: 10, discountPercent: 10 })])
    const result = await performCheckout(access, baseInput, NOW)

    expect(result.reused).toBe(false)
    expect(result.receipt.receiptNumber).toMatch(/^QS-20260929-[A-Z0-9]{6}$/)
    expect(result.receipt.total).toBe("27000.00")
    expect(result.receipt.subtotal).toBe("30000.00")
    expect(result.receipt.discountTotal).toBe("3000.00")
    expect(result.receipt.itemCount).toBe(2)
    expect(result.receipt.lineCount).toBe(1)
    expect(result.receipt.lines[0]).toMatchObject({
      itemId: "item-a",
      name: "Apple",
      quantity: 2,
      unitPrice: "15000.00",
      unitPricePaid: "13500.00",
      lineTotal: "27000.00",
    })
    // The header kept the cashier snapshot + idempotency key.
    expect(state.header).toMatchObject({
      clientRequestId: "req-abcdef12",
      cashierId: "user-1",
      cashierName: "Kasir Satu",
      note: null,
    })
    // Products are locked in sorted order (deadlock-free) and scoped to the store.
    expect(state.lockCalls).toEqual([
      { storeId: baseInput.storeId, itemIds: ["item-a"] },
    ])
  })

  test("a retried/double-clicked clientRequestId replays the original sale", async () => {
    const original = {
      id: "r-original",
      storeId: baseInput.storeId,
      receiptNumber: "QS-20260929-ORIG01",
      status: "completed" as const,
      subtotal: "30000.00",
      discountTotal: "0.00",
      total: "30000.00",
      itemCount: 2,
      lineCount: 1,
      note: null,
      cashierId: "user-1",
      paidAt: "2026-09-29T10:00:00.000Z",
      createdAt: "2026-09-29T10:00:00.000Z",
      lines: [],
    }
    const { access, state, tx } = makeFakeAccess([locked()], { existing: original })
    const result = await performCheckout(access, baseInput, NOW)

    expect(result.reused).toBe(true)
    expect(result.receipt.id).toBe("r-original")
    // Nothing was written: no locks, no insert, no stock movement.
    expect(state.lockCalls).toHaveLength(0)
    expect(state.insertAttempts).toBe(0)
    expect(tx.lockItems).not.toHaveBeenCalled()
    expect(tx.applyStockMovement).not.toHaveBeenCalled()
  })

  test("insufficient stock at movement time aborts the whole sale (rollback)", async () => {
    const { access, state, tx } = makeFakeAccess([locked({ stocks: 10 })], {
      movements: [{ itemId: "item-a", ok: false }], // lost a race with another cashier
    })
    await expect(performCheckout(access, baseInput, NOW)).rejects.toMatchObject({
      name: "CheckoutError",
      code: "INSUFFICIENT_STOCK",
      status: 409,
    })
    // The receipt row was rolled back with the transaction.
    expect(state.insertAttempts).toBe(1)
    expect(tx.loadReceipt).not.toHaveBeenCalled()
  })

  test("a product deleted after the cart was built fails with PRODUCT_NOT_FOUND", async () => {
    const { access } = makeFakeAccess([]) // lock returns nothing
    await expect(performCheckout(access, baseInput, NOW)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
      status: 404,
    })
  })

  test("validation failures happen before the transaction opens", async () => {
    const { access, tx } = makeFakeAccess([locked()])
    await expect(
      performCheckout(access, { ...baseInput, clientRequestId: "short" }, NOW)
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" })
    await expect(performCheckout(access, { ...baseInput, lines: [] }, NOW)).rejects.toMatchObject({
      code: "EMPTY_CART",
    })
    expect(tx.lockItems).not.toHaveBeenCalled()
    expect(tx.insertReceipt).not.toHaveBeenCalled()
  })
})


describe("performCheckout — resilience", () => {
  test("a receipt-number collision retries with a fresh suffix (no duplicate sale)", async () => {
    const { access, state } = makeFakeAccess([locked()], { failFirstInsert: true })
    const result = await performCheckout(access, baseInput, NOW)

    expect(state.insertAttempts).toBe(2) // first collided, second won
    expect(result.reused).toBe(false)
    expect(result.receipt.receiptNumber).toMatch(/^QS-20260929-[A-Z0-9]{6}$/)
  })

  test("an endless unique violation surfaces instead of hanging forever", async () => {
    const { access, state } = makeFakeAccess([locked()], { failEveryInsert: true })
    await expect(performCheckout(access, baseInput, NOW)).rejects.toMatchObject({ code: "23505" })
    expect(state.insertAttempts).toBe(3) // RECEIPT_NUMBER_ATTEMPTS
  })

  test("a receipt that cannot be reloaded is reported as STORE_NOT_FOUND", async () => {
    const { access } = makeFakeAccess([locked()], { dropReceipt: true })
    await expect(performCheckout(access, baseInput, NOW)).rejects.toMatchObject({
      code: "STORE_NOT_FOUND",
      status: 404,
    })
  })

  test("duplicate lines in one request are merged before locking", async () => {
    const { access, state } = makeFakeAccess([locked({ stocks: 10 })])
    await performCheckout(
      access,
      {
        ...baseInput,
        lines: [
          { itemId: "item-a", quantity: 1 },
          { itemId: "item-a", quantity: 2 },
        ],
      },
      NOW
    )
    // One lock call, one line, quantity 1+2 — never a double decrement.
    expect(state.lockCalls).toHaveLength(1)
    expect(state.lines).toHaveLength(1)
    expect(state.lines?.[0]?.quantity).toBe(3)
  })
})

