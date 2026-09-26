/**
 * GET  /api/quickstore/stores  — list stores owned by or where user is a member
 * POST /api/quickstore/stores  — create a new store
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeMembers, stores } from "@/lib/db/schema"

export const runtime = "nodejs"

// ── GET /api/quickstore/stores ───────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  // Fetch stores owned by the user
  const ownedStores = await db.query.stores.findMany({
    where: eq(stores.userId, userId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  })

  // Fetch stores where user is a member (admin)
  const memberRows = await db.query.storeMembers.findMany({
    where: eq(storeMembers.userId, userId),
    with: { store: true },
  })
  const memberStores = memberRows.map((m) => m.store).filter(Boolean)

  // Merge and deduplicate
  const allIds = new Set(ownedStores.map((s) => s.id))
  for (const s of memberStores) {
    if (!allIds.has(s.id)) {
      allIds.add(s.id)
      ownedStores.push(s)
    }
  }

  // Sort by createdAt desc
  ownedStores.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return NextResponse.json(ownedStores)
}

// ── POST /api/quickstore/stores ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { name, description, open, paymentQr } = body as Record<string, unknown>

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Store name is required" }, { status: 400 })
  }
  if (name.trim().length > 20) {
    return NextResponse.json({ error: "Name must be 20 characters or less" }, { status: 400 })
  }
  if (description && typeof description === "string" && description.length > 100) {
    return NextResponse.json({ error: "Description must be 100 characters or less" }, { status: 400 })
  }

  const [created] = await db
    .insert(stores)
    .values({
      userId,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      open: typeof open === "boolean" ? open : true,
      paymentQr: typeof paymentQr === "string" ? paymentQr : undefined,
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
