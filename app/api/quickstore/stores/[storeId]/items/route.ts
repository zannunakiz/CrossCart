/**
 * GET  /api/quickstore/stores/[storeId]/items  — list items (master | admin)
 * POST /api/quickstore/stores/[storeId]/items  — create item (master | admin)
 *
 * GET answers two shapes on purpose:
 *  - no `q` / `availability` / `sort` / `dir` / `page` / `limit` → `StoreItem[]`
 *    (the whole catalog, A→Z). The cashier and the voice interpreter
 *    need every row in one shot, so that call stays exactly as it was.
 *  - any of those params → `{ items, total, page, pageSize, totalPages }`,
 *    searched / filtered / sorted / paged in SQL so the Items table never
 *    transfers a whole catalog to render ten rows.
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeItems } from "@/lib/db/schema"
import {
  getStoreItemsPage,
  getUserRole,
} from "@/lib/quickstore/queries"
import { hasItemListParams, parseItemListQuery } from "@/lib/quickstore/item-list"
import { hasPermission } from "@/lib/quickstore/permissions"
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  isPriceInput,
  parseStockInput,
  priceToCents,
} from "@/lib/quickstore/cashier"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string }> }

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "item:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const searchParams = req.nextUrl.searchParams

  // Unpaged call (cashier / voice): the full catalog, A→Z.
  if (!hasItemListParams(searchParams)) {
    const items = await db.query.storeItems.findMany({
      where: eq(storeItems.storeId, storeId),
      orderBy: (i, { asc }) => [asc(i.name)],
    })

    return NextResponse.json(items)
  }

  // Paged call (Items table): one page of rows + the total for the pager.
  const page = await getStoreItemsPage(storeId, parseItemListQuery(searchParams))
  return NextResponse.json(page)
}


// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "item:create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Item name is required" }, { status: 400 })
  }
  if (name.trim().length > NAME_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Name must be ${NAME_MAX_LENGTH} characters or less` },
      { status: 400 }
    )
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 })
  }
  if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or less` },
      { status: 400 }
    )
  }
  if (!isPriceInput(price)) {
    return NextResponse.json({ error: "Price must be numbers only" }, { status: 400 })
  }
  const parsedStocks = parseStockInput(stocks)
  if (parsedStocks === undefined) {
    return NextResponse.json({ error: "Stocks must be between 0 and 999" }, { status: 400 })
  }
  if (
    typeof discountPercent === "number" &&
    (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100)
  ) {
    return NextResponse.json({ error: "discountPercent must be 0-100" }, { status: 400 })
  }

  const [item] = await db
    .insert(storeItems)
    .values({
      storeId,
      userId: session.user.id,
      name: (name as string).trim(),
      description: description.trim(),
      // Prices are whole numbers: store them as the canonical numeric string.
      price: (priceToCents(String(price)) / 100).toFixed(2),
      available: typeof available === "boolean" ? available : true,
      stocks: parsedStocks ?? undefined,
      discountPercent: typeof discountPercent === "number" ? discountPercent : 0,
    })
    .returning()

  return NextResponse.json(item, { status: 201 })
}
