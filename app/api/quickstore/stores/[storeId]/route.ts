/**
 * GET    /api/quickstore/stores/[storeId]  — get store detail (members can view)
 * PUT    /api/quickstore/stores/[storeId]  — edit store (master | admin)
 * DELETE /api/quickstore/stores/[storeId]  — delete store (master or store owner)
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
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
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  })
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 })
  }

  return NextResponse.json({
    ...store,
    role,
    /** The creator of the store may always delete it, whatever their role. */
    isOwner: store.userId === session.user.id,
  })
}

// ── PUT ──────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "store:edit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { name, description, open, paymentQr } = body as Record<string, unknown>

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Store name cannot be empty" }, { status: 400 })
    }
    if (name.trim().length > 20) {
      return NextResponse.json({ error: "Name must be 20 characters or less" }, { status: 400 })
    }
  }
  if (description !== undefined && typeof description === "string" && description.length > 100) {
    return NextResponse.json({ error: "Description must be 100 characters or less" }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }
  if (name !== undefined) updateData.name = (name as string).trim()
  if (description !== undefined) updateData.description = description
  if (open !== undefined) updateData.open = open
  if (paymentQr !== undefined) updateData.paymentQr = paymentQr

  const [updated] = await db
    .update(stores)
    .set(updateData)
    .where(eq(stores.id, storeId))
    .returning()

  return NextResponse.json(updated)
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  })
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 })
  }

  const role = await getUserRole(session.user.id, storeId)
  // Allowed for a master (store:delete) or for the store owner.
  const isOwner = store.userId === session.user.id
  if (!isOwner && !hasPermission(role, "store:delete")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await db.delete(stores).where(eq(stores.id, storeId))
  return NextResponse.json({ success: true })
}
