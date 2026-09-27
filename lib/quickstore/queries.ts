/**
 * Server-side QuickStore query helpers.
 * Import only in API routes / Server Components.
 */
import { and, desc, eq, isNull } from "drizzle-orm"

import { db } from "@/lib/db"
import { qsHistory, storeMembers, stores } from "@/lib/db/schema"
import type { StoreRole } from "@/lib/db/schema"
import type { Receipt } from "@/lib/quickstore/cashier"
import { mapReceiptRow } from "@/lib/quickstore/checkout-drizzle"

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

/** Hard bounds for the history page size. */
export const HISTORY_MIN_LIMIT = 1
export const HISTORY_MAX_LIMIT = 100
export const HISTORY_DEFAULT_LIMIT = 20

/**
 * Latest sales of a store, newest first, with their receipt lines.
 * `limit` is clamped so a client cannot ask for the whole table at once.
 */
export async function getStoreHistory(
  storeId: string,
  limit: number = HISTORY_DEFAULT_LIMIT
): Promise<Receipt[]> {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.trunc(limit), HISTORY_MIN_LIMIT), HISTORY_MAX_LIMIT)
    : HISTORY_DEFAULT_LIMIT

  const rows = await db.query.qsHistory.findMany({
    where: eq(qsHistory.storeId, storeId),
    orderBy: [desc(qsHistory.paidAt), desc(qsHistory.createdAt)],
    limit: safeLimit,
    with: {
      lines: true,
      // Fallback for receipts recorded before `cashierName` was snapshotted.
      cashier: { columns: { name: true } },
    },
  })

  return rows.map((row) => mapReceiptRow(row, row.cashier?.name ?? null, row.lines))
}
