/**
 * GET  /api/quickstore/stores/[storeId]/items  — list items (master | admin)
 * POST /api/quickstore/stores/[storeId]/items  — create item (master | admin)
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeItems } from "@/lib/db/schema"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string }> }

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "store:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const items = await db.query.storeItems.findMany({
    where: eq(storeItems.storeId, storeId),
    orderBy: (i, { desc, asc }) => [desc(i.highlight), asc(i.name)],
  })

  return NextResponse.json(items)
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
    currency,
    available,
    stocks,
    discountPercent,
    highlight,
  } = body as Record<string, unknown>

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Item name is required" }, { status: 400 })
  }
  if (name.trim().length > 20) {
    return NextResponse.json({ error: "Name must be 20 characters or less" }, { status: 400 })
  }
  if (description && typeof description === "string" && description.length > 100) {
    return NextResponse.json({ error: "Description must be 100 characters or less" }, { status: 400 })
  }
  if (typeof discountPercent === "number" && (discountPercent < 0 || discountPercent > 100)) {
    return NextResponse.json({ error: "discountPercent must be 0-100" }, { status: 400 })
  }

  const [item] = await db
    .insert(storeItems)
    .values({
      storeId,
      userId: session.user.id,
      name: (name as string).trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      price: String(price ?? "0"),
      currency: (currency as "USD" | "IDR") ?? "IDR",
      available: typeof available === "boolean" ? available : true,
      stocks: typeof stocks === "number" ? stocks : undefined,
      discountPercent: typeof discountPercent === "number" ? discountPercent : 0,
      highlight: typeof highlight === "boolean" ? highlight : false,
    })
    .returning()

  return NextResponse.json(item, { status: 201 })
}
