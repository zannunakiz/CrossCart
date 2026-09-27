/**
 * GET    /api/quickstore/stores/[storeId]  — get store detail (members can view)
 * PUT    /api/quickstore/stores/[storeId]  — edit store (per-field permission)
 * DELETE /api/quickstore/stores/[storeId]  — soft delete (master or owner)
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNull } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission, type Permission } from "@/lib/quickstore/permissions"

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
/**
 * Partial update. Each field is permission-checked *individually*, and only
 * when it actually changes — so a role can be granted one capability (e.g.
 * open/close status) without silently gaining the others (details, credential),
 * and no-op payloads never trigger a spurious 403.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await db.query.stores.findFirst({
    where: and(eq(stores.id, storeId), isNull(stores.deletedAt)),
  })
  if (!existing) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 })
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
  if (description !== undefined && typeof description === "string" && description.length > 50) {
    return NextResponse.json({ error: "Description must be 50 characters or less" }, { status: 400 })
  }
  if (open !== undefined && typeof open !== "boolean") {
    return NextResponse.json({ error: "open must be a boolean" }, { status: 400 })
  }
  if (paymentQr !== undefined && paymentQr !== null && typeof paymentQr !== "string") {
    return NextResponse.json({ error: "paymentQr must be a URL string or null" }, { status: 400 })
  }

  /** 403 that names the missing permission so the UI can explain the lock. */
  const needs = (permission: Permission) =>
    NextResponse.json({ error: "Forbidden", requiredPermission: permission }, { status: 403 })

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
    return NextResponse.json(existing)
  }

  const [updated] = await db
    .update(stores)
    .set({ ...updateData, updatedAt: new Date() })
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
    where: and(eq(stores.id, storeId), isNull(stores.deletedAt)),
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

  /**
   * Soft delete. The row, its items, its members and the complete sales history
   * stay in the database for audit, reporting and dispute handling — the store
   * simply disappears from every read path (`getUserRole`, listings, …) and is
   * closed so no cashier can keep selling into it.
   */
  await db
    .update(stores)
    .set({ deletedAt: new Date(), open: false, updatedAt: new Date() })
    .where(eq(stores.id, storeId))

  return NextResponse.json({ success: true })
}
