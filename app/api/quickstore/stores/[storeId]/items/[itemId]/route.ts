/**
 * PUT    /api/quickstore/stores/[storeId]/items/[itemId]  — edit item
 * DELETE /api/quickstore/stores/[storeId]/items/[itemId]  — delete item
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeItems } from "@/lib/db/schema"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  isPriceInput,
  parseStockInput,
  priceToCents,
} from "@/lib/quickstore/cashier"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string; itemId: string }> }

// ── PUT ──────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId, itemId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "item:update")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Verify item belongs to this store
  const existing = await db.query.storeItems.findFirst({
    where: and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)),
  })
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const {
    name,
    description,
    price,
    available,
    stocks,
    discountPercent,
  } = body as Record<string, unknown>

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Item name cannot be empty" }, { status: 400 })
    }
    if ((name as string).trim().length > NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Name must be ${NAME_MAX_LENGTH} characters or less` },
        { status: 400 }
      )
    }
  }
  if (description !== undefined) {
    if (typeof description !== "string" || description.trim().length === 0) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 })
    }
    if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or less` },
        { status: 400 }
      )
    }
  }
  if (price !== undefined && !isPriceInput(price)) {
    return NextResponse.json({ error: "Price must be numbers only" }, { status: 400 })
  }
  const parsedStocks = stocks === undefined ? null : parseStockInput(stocks)
  if (parsedStocks === undefined) {
    return NextResponse.json({ error: "Stocks must be between 0 and 999" }, { status: 400 })
  }
  if (
    typeof discountPercent === "number" &&
    (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100)
  ) {
    return NextResponse.json({ error: "discountPercent must be 0-100" }, { status: 400 })
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) updateData.name = (name as string).trim()
  if (description !== undefined) updateData.description = (description as string).trim()
  // Prices are whole numbers: store them as the canonical numeric string.
  if (price !== undefined) updateData.price = (priceToCents(String(price)) / 100).toFixed(2)
  if (available !== undefined) updateData.available = available
  // An explicit null / blank clears the stock back to "unlimited".
  if (stocks !== undefined) updateData.stocks = parsedStocks
  if (discountPercent !== undefined) updateData.discountPercent = discountPercent

  const [updated] = await db
    .update(storeItems)
    .set(updateData)
    .where(and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)))
    .returning()

  return NextResponse.json(updated)
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId, itemId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "item:delete")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await db.query.storeItems.findFirst({
    where: and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)),
  })
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 })
  }

  await db
    .delete(storeItems)
    .where(and(eq(storeItems.id, itemId), eq(storeItems.storeId, storeId)))

  return NextResponse.json({ success: true })
}
