"use server"

/**
 * QuickStore — stores.
 *
 * Direct port of the former route handlers in `app/api/quickstore/stores/**`:
 * the logic, the order of the checks and every message are unchanged. Only the
 * response channel is different — `NextResponse.json(…, { status })` became
 * `ok(…)` / `fail(…, { status })` (see `./result.ts`).
 */
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/lib/db"
import { storeMembers, stores } from "@/lib/db/schema"
import type { Store, StoreRole } from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"
import { hasPermission, type Permission } from "@/lib/quickstore/permissions"
import { getUserRole } from "@/lib/quickstore/queries"
import { currentSession } from "./context"
import { fail, ok, type ActionResult } from "./result"
import { jsonSafe } from "./serialize"

/** A store row plus what the caller may do with it (`role` drives RBAC). */
type StoreWithRole = Store & { role: StoreRole; isOwner: boolean }

/** Stores the caller owns or is a member of (soft-deleted stores stay hidden). */
export async function listStores(): Promise<ActionResult<Store[]>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const userId = session.userId

  // Stores owned by the user.
  const ownedStores = await db.query.stores.findMany({
    where: and(eq(stores.userId, userId), isNull(stores.deletedAt)),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  })

  // Stores where the user is a member (admin / master).
  const memberRows = await db.query.storeMembers.findMany({
    where: eq(storeMembers.userId, userId),
    with: { store: true },
  })
  const memberStores = memberRows
    .map((m) => m.store)
    .filter((store) => !!store && !store.deletedAt)

  // Merge and deduplicate.
  const allIds = new Set(ownedStores.map((s) => s.id))
  for (const s of memberStores) {
    if (!allIds.has(s.id)) {
      allIds.add(s.id)
      ownedStores.push(s)
    }
  }

  // Sort by createdAt desc.
  ownedStores.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return ok(jsonSafe(ownedStores))
}

/**
 * Creates a store for the caller. The name must be unique-ish per UI rules:
 * required, ≤ 20 characters, description ≤ 50 (same limits the form enforces).
 */
export async function createStore(input: {
  name: string
  description?: string
  open?: boolean
  paymentQr?: string
}): Promise<ActionResult<Store>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const { name, description, open, paymentQr } = input

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return fail("Store name is required", { status: 400 })
  }
  if (name.trim().length > 20) {
    return fail("Name must be 20 characters or less", { status: 400 })
  }
  if (description && typeof description === "string" && description.length > 50) {
    return fail("Description must be 50 characters or less", { status: 400 })
  }

  const [created] = await db
    .insert(stores)
    .values({
      userId: session.userId,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      open: typeof open === "boolean" ? open : true,
      paymentQr: typeof paymentQr === "string" ? paymentQr : undefined,
    })
    .returning()

  return ok(jsonSafe(created))
}

/** One store, for members only — the store page and the cashier both read it. */
export async function getStore(storeId: string): Promise<ActionResult<StoreWithRole>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  // Unknown (or soft-deleted) store → 404 *before* the permission check, so the
  // UI can tell "this store does not exist" (→ /not-found) apart from
  // "you are not a member of it" (→ the store list). A malformed id (e.g.
  // `...aezzz`) can never match a row — Postgres would raise 22P02 on the uuid
  // comparison — so it is answered exactly the same way.
  if (!isUuid(storeId)) return fail("Store not found", { status: 404 })

  const store = await db.query.stores.findFirst({
    where: and(eq(stores.id, storeId), isNull(stores.deletedAt)),
  })
  if (!store) return fail("Store not found", { status: 404 })

  const role = await getUserRole(session.userId, storeId)
  if (!role) return fail("Forbidden", { status: 403 })

  return ok(
    jsonSafe({
      ...store,
      role,
      /** The creator of the store may always delete it, whatever their role. */
      isOwner: store.userId === session.userId,
    })
  )
}

/**
 * Partial update. Each field is permission-checked *individually*, and only
 * when it actually changes — so a role can be granted one capability (e.g.
 * open/close status) without silently gaining the others (details, credential),
 * and no-op payloads never trigger a spurious 403.
 */
export async function updateStore(
  storeId: string,
  patch: {
    name?: string
    description?: string | null
    open?: boolean
    paymentQr?: string | null
  }
): Promise<ActionResult<Store>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  // Malformed id → same answer as an unknown store (see `getStore`).
  if (!isUuid(storeId)) return fail("Store not found", { status: 404 })

  const role = await getUserRole(session.userId, storeId)
  if (!role) return fail("Forbidden", { status: 403 })

  const existing = await db.query.stores.findFirst({
    where: and(eq(stores.id, storeId), isNull(stores.deletedAt)),
  })
  if (!existing) return fail("Store not found", { status: 404 })

  const { name, description, open, paymentQr } = patch

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return fail("Store name cannot be empty", { status: 400 })
    }
    if (name.trim().length > 20) {
      return fail("Name must be 20 characters or less", { status: 400 })
    }
  }
  if (description !== undefined && typeof description === "string" && description.length > 50) {
    return fail("Description must be 50 characters or less", { status: 400 })
  }
  if (open !== undefined && typeof open !== "boolean") {
    return fail("open must be a boolean", { status: 400 })
  }
  if (paymentQr !== undefined && paymentQr !== null && typeof paymentQr !== "string") {
    return fail("paymentQr must be a URL string or null", { status: 400 })
  }

  /**
   * 403 that names the missing permission (`code`), so the UI can still explain
   * the lock — the old `requiredPermission` field, carried in the same envelope.
   */
  const needs = (permission: Permission) =>
    fail<Store>("Forbidden", { status: 403, code: permission })

  const updateData: Record<string, unknown> = {}

  // Store details — master only by default.
  if (typeof name === "string" && name.trim() !== existing.name) {
    if (!hasPermission(role, "store:update-details")) return needs("store:update-details")
    updateData.name = name.trim()
  }
  if (description !== undefined && (description ?? null) !== existing.description) {
    if (!hasPermission(role, "store:update-details")) return needs("store:update-details")
    updateData.description = description
  }

  // Open / closed — day-to-day operations, granted to admins too.
  if (open !== undefined && open !== existing.open) {
    if (!hasPermission(role, "store:update-status")) return needs("store:update-status")
    updateData.open = open
  }

  // Payment credential (QR image) — master only by default.
  if (paymentQr !== undefined && paymentQr !== existing.paymentQr) {
    if (!hasPermission(role, "store:update-credential")) return needs("store:update-credential")
    updateData.paymentQr = paymentQr
  }

  // Nothing changed — return the row as-is instead of writing a no-op update.
  if (Object.keys(updateData).length === 0) {
    return ok(jsonSafe(existing))
  }

  const [updated] = await db
    .update(stores)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(stores.id, storeId))
    .returning()

  return ok(jsonSafe(updated))
}

/**
 * Soft delete — allowed for a master (`store:delete`) or for the store owner.
 *
 * The row, its items, its members and the complete sales history stay in the
 * database for audit, reporting and dispute handling — the store simply
 * disappears from every read path (`getUserRole`, listings, …) and is closed so
 * no cashier can keep selling into it.
 */
export async function deleteStore(storeId: string): Promise<ActionResult<{ success: true }>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  // Malformed id → same answer as an unknown store (see `getStore`).
  if (!isUuid(storeId)) return fail("Store not found", { status: 404 })

  const store = await db.query.stores.findFirst({
    where: and(eq(stores.id, storeId), isNull(stores.deletedAt)),
  })
  if (!store) return fail("Store not found", { status: 404 })

  const role = await getUserRole(session.userId, storeId)
  const isOwner = store.userId === session.userId
  if (!isOwner && !hasPermission(role, "store:delete")) {
    return fail("Forbidden", { status: 403 })
  }

  await db
    .update(stores)
    .set({ deletedAt: new Date(), open: false, updatedAt: new Date() })
    .where(eq(stores.id, storeId))

  return ok({ success: true })
}