/**
 * QuickStore Cashier — Drizzle implementation of the checkout data port.
 *
 * This is the only checkout module that touches SQL. It is imported by the API
 * route (never by tests), which keeps `performCheckout` pure and testable.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { qsHistory, qsHistoryItems, storeItems, users } from "@/lib/db/schema"
import type { Receipt, ReceiptLine } from "@/lib/quickstore/cashier"
import type {
  CheckoutAccess,
  CheckoutTx,
  LockedItem,
  SaleHeaderInput,
  SaleLineInput,
  StockMovementResult,
} from "@/lib/quickstore/checkout"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ─────────────────────────────────────────────────────────────────────────────
// Row → DTO mapping
// ─────────────────────────────────────────────────────────────────────────────

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function mapReceiptRow(
  header: typeof qsHistory.$inferSelect,
  cashierName: string | null,
  lineRows: (typeof qsHistoryItems.$inferSelect)[]
): Receipt {
  const lines: ReceiptLine[] = [...lineRows]
    // Receipts always print in the order the cashier entered them.
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((line) => ({
      id: line.id,
      itemId: line.itemId,
      name: line.name,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      unitPricePaid: line.unitPricePaid,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    }))

  return {
    id: header.id,
    storeId: header.storeId,
    receiptNumber: header.receiptNumber,
    status: header.status,
    currency: header.currency,
    subtotal: header.subtotal,
    discountTotal: header.discountTotal,
    total: header.total,
    itemCount: header.itemCount,
    lineCount: header.lineCount,
    paymentMethod: header.paymentMethod,
    note: header.note,
    cashierId: header.cashierId,
    // Snapshot first: receipts must keep the name they were issued with, even
    // after the cashier renames their account or deletes it entirely.
    cashierName: header.cashierName ?? cashierName ?? null,
    paidAt: toIso(header.paidAt),
    createdAt: toIso(header.createdAt),
    lines,
  }
}

/** Load a fully hydrated receipt (header + cashier name + ordered lines). */
export async function loadReceiptById(tx: Tx, receiptId: string): Promise<Receipt | null> {
  const [row] = await tx
    .select({ sale: qsHistory, cashierName: users.name })
    .from(qsHistory)
    .leftJoin(users, eq(qsHistory.cashierId, users.id))
    .where(eq(qsHistory.id, receiptId))
    .limit(1)

  if (!row) return null

  const lineRows = await tx
    .select()
    .from(qsHistoryItems)
    .where(eq(qsHistoryItems.historyId, receiptId))
    .orderBy(asc(qsHistoryItems.position), asc(qsHistoryItems.createdAt))

  return mapReceiptRow(row.sale, row.cashierName ?? null, lineRows)
}


// ─────────────────────────────────────────────────────────────────────────────
// Transaction port
// ─────────────────────────────────────────────────────────────────────────────

function createCheckoutTx(tx: Tx): CheckoutTx {
  return {
    async lockItems(storeId: string, itemIds: string[]): Promise<LockedItem[]> {
      if (itemIds.length === 0) return []
      return tx
        .select({
          id: storeItems.id,
          name: storeItems.name,
          price: storeItems.price,
          currency: storeItems.currency,
          available: storeItems.available,
          stocks: storeItems.stocks,
          discountPercent: storeItems.discountPercent,
        })
        .from(storeItems)
        .where(and(eq(storeItems.storeId, storeId), inArray(storeItems.id, itemIds)))
        // Deterministic lock order → concurrent checkouts cannot deadlock.
        .orderBy(asc(storeItems.id))
        .for("update")
    },

    async findReceiptByRequestId(storeId: string, clientRequestId: string) {
      const [row] = await tx
        .select({ id: qsHistory.id })
        .from(qsHistory)
        .where(
          and(eq(qsHistory.storeId, storeId), eq(qsHistory.clientRequestId, clientRequestId))
        )
        .limit(1)

      if (!row) return null
      return loadReceiptById(tx, row.id)
    },

    async insertReceipt(values: SaleHeaderInput) {
      const [row] = await tx
        .insert(qsHistory)
        .values({
          storeId: values.storeId,
          cashierId: values.cashierId,
          receiptNumber: values.receiptNumber,
          currency: values.currency,
          subtotal: values.subtotal,
          discountTotal: values.discountTotal,
          total: values.total,
          lineCount: values.lineCount,
          itemCount: values.itemCount,
          paymentMethod: values.paymentMethod,
          note: values.note,
          cashierName: values.cashierName,
          clientRequestId: values.clientRequestId,
          paidAt: values.paidAt,
        })
        .returning({ id: qsHistory.id })

      return row
    },

    async insertReceiptLines(receiptId: string, lines: SaleLineInput[]) {
      if (lines.length === 0) return
      await tx.insert(qsHistoryItems).values(
        lines.map((line) => ({
          historyId: receiptId,
          itemId: line.itemId,
          name: line.name,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          unitPricePaid: line.unitPricePaid,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          position: line.position,
        }))
      )
    },

    async applyStockMovement(
      moves: { itemId: string; quantity: number }[]
    ): Promise<StockMovementResult[]> {
      const results: StockMovementResult[] = []
      // Sorted for the same deadlock-free reason as the lock above.
      const ordered = [...moves].sort((a, b) => a.itemId.localeCompare(b.itemId))

      for (const move of ordered) {
        const updated = await tx
          .update(storeItems)
          .set({
            // NULL stock means "unlimited" — leave it untouched.
            stocks: sql`case when "stocks" is null then null else "stocks" - ${move.quantity} end`,
            purchasedAmount: sql`"purchased_amount" + ${move.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(storeItems.id, move.itemId),
              // Guard even without the row lock: never let stock go negative.
              sql`("stocks" is null or "stocks" >= ${move.quantity})`
            )
          )
          .returning({ id: storeItems.id })

        results.push({ itemId: move.itemId, ok: updated.length === 1 })
      }

      return results
    },

    loadReceipt(receiptId: string) {
      return loadReceiptById(tx, receiptId)
    },
  }
}

/** Checkout access backed by the app's Drizzle connection. */
export const drizzleCheckoutAccess: CheckoutAccess = {
  withTransaction: (fn) => db.transaction((tx) => fn(createCheckoutTx(tx))),
}
