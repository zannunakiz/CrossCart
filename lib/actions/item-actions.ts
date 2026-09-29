"use server"

/**
 * QuickStore — catalog items.
 *
 * Direct port of the former route handlers in
 * `app/api/quickstore/stores/[storeId]/items/**`. Same checks, same messages;
 * only the response channel changed (see `./result.ts`).
 *
 * Two read shapes are kept exactly as they were:
 *  - `listStoreItems`     → the whole catalog, A→Z (cashier + voice interpreter
 *    need every row in one shot).
 *  - `listStoreItemsPage` → `{ items, total, page, pageSize, totalPages }`,
 *    searched / filtered / sorted / paged in SQL so the Items table never
 *    transfers a whole catalog to render ten rows.
 */
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { storeItems } from "@/lib/db/schema"
import type { StoreItem } from "@/lib/db/schema"
import { isUniqueViolation } from "@/lib/quickstore/checkout"
import { findStoreItemByName, getStoreItemsPage, getUserRole } from "@/lib/quickstore/queries"
import type { StoreItemsPage } from "@/lib/quickstore/queries"
import { hasItemListParams, parseItemListQuery } from "@/lib/quickstore/item-list"
import { hasPermission } from "@/lib/quickstore/permissions"
import {
  DESCRIPTION_MAX_LENGTH,
  ITEM_NAME_TAKEN_MESSAGE,
  NAME_MAX_LENGTH,
  isPriceInput,
  parseStockInput,
  priceToCents,
} from "@/lib/quickstore/cashier"
import { currentSession } from "./context"
import { fail, ok, type ActionResult } from "./result"
import { jsonSafe } from "./serialize"

/** What the create / update actions accept — mirrors the old JSON bodies. */
type ItemInput = {
  name?: string
  description?: string
  price?: string | number
  available?: boolean
  stocks?: number | string | null
  discountPercent?: number
}

/** The whole catalog, A→Z — what the cashier and the voice interpreter read. */
export async function listStoreItems(storeId: string): Promise<ActionResult<StoreItem[]>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "item:view")) return fail("Forbidden", { status: 403 })

  const items = await db.query.storeItems.findMany({
    where: eq(storeItems.storeId, storeId),
    orderBy: (i, { asc }) => [asc(i.name)],
  })

  return ok(jsonSafe(items))
}

/**
 * One page for the Items table. `params` is the same query string the tab keeps
 * in the URL (`q`, `availability`, `sort`, `dir`, `page`, `limit`), parsed by
 * the very same helper the table uses — so client and server cannot drift.
 */
export async function listStoreItemsPage(
  storeId: string,
  params: string
): Promise<ActionResult<StoreItemsPage>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "item:view")) return fail("Forbidden", { status: 403 })

  const query = new URLSearchParams(params)

  // An unpaged request (no item-list keys at all) means "the whole catalog" —
  // the same fallback the endpoint had, kept so no caller can lose rows.
  if (!hasItemListParams(query)) {
    const items = await db.query.storeItems.findMany({
      where: eq(storeItems.storeId, storeId),
      orderBy: (i, { asc }) => [asc(i.name)],
    })
    return ok(
      jsonSafe({
        items,
        total: items.length,
        page: 1,
        pageSize: items.length || 1,
        totalPages: 1,
      })
    )
  }

  const page = await getStoreItemsPage(storeId, parseItemListQuery(query))
  return ok(jsonSafe(page))
}

/**
 * Creates an item. Refuses a name the store already uses (case-insensitive, so
 * "Apple" === "aPPle") with `409` — backed by the
 * `store_items_store_name_unique` index.
 */
export async function createStoreItem(
  storeId: string,
  input: ItemInput
): Promise<ActionResult<StoreItem>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "item:create")) return fail("Forbidden", { status: 403 })

  const { name, description, price, available, stocks, discountPercent } = input

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return fail("Item name is required", { status: 400 })
  }
  if (name.trim().length > NAME_MAX_LENGTH) {
    return fail(`Name must be ${NAME_MAX_LENGTH} characters or less`, { status: 400 })
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return fail("Description is required", { status: 400 })
  }
  if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
    return fail(`Description must be ${DESCRIPTION_MAX_LENGTH} characters or less`, {
      status: 400,
    })
  }
  if (!isPriceInput(price)) {
    return fail("Price must be numbers only", { status: 400 })
  }
  const parsedStocks = parseStockInput(stocks)
  if (parsedStocks === undefined) {
    return fail("Stocks must be between 0 and 999", { status: 400 })
  }
  if (
    typeof discountPercent === "number" &&
    (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100)
  ) {
    return fail("discountPercent must be 0-100", { status: 400 })
  }

  // Names are unique per store, case-insensitively: this pre-check answers a
  // friendly 409, the unique index is the hard guarantee.
  if (await findStoreItemByName(storeId, name)) {
    return fail(ITEM_NAME_TAKEN_MESSAGE, { status: 409 })
  }

  try {
    const [item] = await db
      .insert(storeItems)
      .values({
        storeId,
        userId: session.userId,
        name: name.trim(),
        description: description.trim(),
        // Prices are whole numbers: store them as the canonical numeric string.
        price: (priceToCents(String(price)) / 100).toFixed(2),
        available: typeof available === "boolean" ? available : true,
        stocks: parsedStocks ?? undefined,
        discountPercent: typeof discountPercent === "number" ? discountPercent : 0,
      })
      .returning()

    return ok(jsonSafe(item))
  } catch (err) {
    // Two identical names submitted at the same instant: the index wins.
    if (isUniqueViolation(err)) return fail(ITEM_NAME_TAKEN_MESSAGE, { status: 409 })
    throw err
  }
}

/**
 * Edits an item. Renaming to a name another item already uses
 * (case-insensitively) answers `409`; every other field is only touched when it
 * was actually sent.
 */
export async function updateStoreItem(
  storeId: string,
  itemId: string,
  input: ItemInput
): Promise<ActionResult<StoreItem>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "item:update")) return fail("Forbidden", { status: 403 })

  // Verify the item belongs to this store.
  const existing = await db.query.storeItems.findFirst({
    where: and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)),
  })
  if (!existing) return fail("Item not found", { status: 404 })

  const { name, description, price, available, stocks, discountPercent } = input

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return fail("Item name cannot be empty", { status: 400 })
    }
    if (name.trim().length > NAME_MAX_LENGTH) {
      return fail(`Name must be ${NAME_MAX_LENGTH} characters or less`, { status: 400 })
    }
  }
  if (description !== undefined) {
    if (typeof description !== "string" || description.trim().length === 0) {
      return fail("Description is required", { status: 400 })
    }
    if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
      return fail(`Description must be ${DESCRIPTION_MAX_LENGTH} characters or less`, {
        status: 400,
      })
    }
  }
  if (price !== undefined && !isPriceInput(price)) {
    return fail("Price must be numbers only", { status: 400 })
  }
  const parsedStocks = stocks === undefined ? null : parseStockInput(stocks)
  if (parsedStocks === undefined) {
    return fail("Stocks must be between 0 and 999", { status: 400 })
  }
  if (
    typeof discountPercent === "number" &&
    (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100)
  ) {
    return fail("discountPercent must be 0-100", { status: 400 })
  }

  // Changing the name must not collide with a sibling item — same rule as
  // create ("Apple" === "aPPle"), compared only when the name actually changes
  // so a plain price / stock edit of an unchanged name stays free.
  if (name !== undefined && name.trim() !== existing.name) {
    if (await findStoreItemByName(storeId, name, itemId)) {
      return fail(ITEM_NAME_TAKEN_MESSAGE, { status: 409 })
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) updateData.name = name.trim()
  if (description !== undefined) updateData.description = description.trim()
  // Prices are whole numbers: store them as the canonical numeric string.
  if (price !== undefined) updateData.price = (priceToCents(String(price)) / 100).toFixed(2)
  if (available !== undefined) updateData.available = available
  // An explicit null / blank clears the stock back to "unlimited".
  if (stocks !== undefined) updateData.stocks = parsedStocks
  if (discountPercent !== undefined) updateData.discountPercent = discountPercent

  try {
    const [updated] = await db
      .update(storeItems)
      .set(updateData)
      .where(and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)))
      .returning()

    return ok(jsonSafe(updated))
  } catch (err) {
    // Lost the race against a sibling insert/rename of the same name.
    if (isUniqueViolation(err)) return fail(ITEM_NAME_TAKEN_MESSAGE, { status: 409 })
    throw err
  }
}

/** Deletes an item, once the caller holds `item:delete` and it belongs here. */
export async function deleteStoreItem(
  storeId: string,
  itemId: string
): Promise<ActionResult<{ success: true }>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "item:delete")) return fail("Forbidden", { status: 403 })

  const existing = await db.query.storeItems.findFirst({
    where: and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)),
  })
  if (!existing) return fail("Item not found", { status: 404 })

  await db
    .delete(storeItems)
    .where(and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)))

  return ok({ success: true })
}