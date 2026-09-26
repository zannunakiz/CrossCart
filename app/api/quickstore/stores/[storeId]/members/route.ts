/**
 * GET    /api/quickstore/stores/[storeId]/members  — list members
 * POST   /api/quickstore/stores/[storeId]/members  — invite member by email
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeMembers, users } from "@/lib/db/schema"
import type { StoreRole } from "@/lib/db/schema"
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

  const members = await db.query.storeMembers.findMany({
    where: eq(storeMembers.storeId, storeId),
    with: { user: { columns: { id: true, name: true, email: true, image: true } } },
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  })

  return NextResponse.json(members)
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "member:invite")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { email, memberRole = "admin" } = body as Record<string, unknown>
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }
  if (!["master", "admin"].includes(memberRole as string)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  // Find user by email
  const targetUser = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
    columns: { id: true, name: true, email: true },
  })
  if (!targetUser) {
    return NextResponse.json(
      { error: "No user found with that email" },
      { status: 404 }
    )
  }

  // Prevent inviting yourself
  if (targetUser.id === session.user.id) {
    return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 })
  }

  // Check if already a member
  const existing = await db.query.storeMembers.findFirst({
    where: and(
      eq(storeMembers.storeId, storeId),
      eq(storeMembers.userId, targetUser.id)
    ),
  })
  if (existing) {
    return NextResponse.json({ error: "User is already a member of this store" }, { status: 409 })
  }

  const [member] = await db
    .insert(storeMembers)
    .values({
      storeId,
      userId: targetUser.id,
      role: memberRole as StoreRole,
      invitedBy: session.user.id,
    })
    .returning()

  return NextResponse.json({ ...member, user: targetUser }, { status: 201 })
}
