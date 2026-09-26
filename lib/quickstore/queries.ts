/**
 * Server-side QuickStore query helpers.
 * Import only in API routes / Server Components.
 */
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { storeMembers, stores } from "@/lib/db/schema"
import type { StoreRole } from "@/lib/db/schema"

/**
 * Get the authenticated user's role within a store.
 * Returns null if they are not a member (guest).
 *
 * NOTE: The store owner (stores.userId) is implicitly Master even if they
 * somehow don't appear in store_members. We handle that case below.
 */
export async function getUserRole(
  userId: string,
  storeId: string
): Promise<StoreRole | null> {
  // Check if they're the store owner — owners are always Master
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
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
