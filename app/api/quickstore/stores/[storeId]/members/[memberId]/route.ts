/**
 * PUT    /api/quickstore/stores/[storeId]/members/[memberId]  — change role
 * DELETE /api/quickstore/stores/[storeId]/members/[memberId]  — remove member
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeMembers } from "@/lib/db/schema"
import type { StoreRole } from "@/lib/db/schema"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string; memberId: string }> }

// ── PUT — change role ────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId, memberId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "member:change_role")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { role: newRole } = body as Record<string, unknown>
  if (!["master", "admin"].includes(newRole as string)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  const member = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)),
  })
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  const [updated] = await db
    .update(storeMembers)
    .set({ role: newRole as StoreRole })
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))
    .returning()

  return NextResponse.json(updated)
}

// ── DELETE — remove member ───────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId, memberId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "member:remove")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const member = await db.query.storeMembers.findFirst({
    where: and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)),
  })
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  await db
    .delete(storeMembers)
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))

  return NextResponse.json({ success: true })
}
