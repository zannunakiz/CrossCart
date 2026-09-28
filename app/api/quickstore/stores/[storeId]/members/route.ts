/**
 * GET    /api/quickstore/stores/[storeId]/members  — list members
 * POST   /api/quickstore/stores/[storeId]/members  — invite member by email
 *
 * The store owner is always the master (see `getUserRole`) even when they have
 * no `store_members` row, so the list always answers with them first, flagged
 * `isOwner` — that row can never be re-roled or removed.
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { and, eq, isNull } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeMembers, stores, users } from "@/lib/db/schema"
import type { StoreRole } from "@/lib/db/schema"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string }> }

const USER_COLUMNS = { id: true, name: true, email: true, image: true } as const

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "member:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [store, rows] = await Promise.all([
    db.query.stores.findFirst({
      where: and(eq(stores.id, storeId), isNull(stores.deletedAt)),
      columns: { userId: true, createdAt: true },
      with: { owner: { columns: USER_COLUMNS } },
    }),
    db.query.storeMembers.findMany({
      where: eq(storeMembers.storeId, storeId),
      with: { user: { columns: USER_COLUMNS } },
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    }),
  ])

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 })
  }

  const others = rows.filter((row) => row.userId !== store.userId)
  // The owner row (real row when they were also invited, synthetic when not).
  const ownerRow = rows.find((row) => row.userId === store.userId)
  const owner = ownerRow
    ? { ...ownerRow, role: "master" as StoreRole, isOwner: true }
    : {
        id: `owner-${store.userId}`,
        storeId,
        userId: store.userId,
        role: "master" as StoreRole,
        invitedBy: null,
        createdAt: store.createdAt,
        updatedAt: store.createdAt,
        isOwner: true,
        user: store.owner,
      }

  // Masters first (after the owner), then by the order they joined.
  const sorted = others.sort((a, b) => {
    if (a.role !== b.role) return a.role === "master" ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  return NextResponse.json([
    owner,
    ...sorted.map((row) => ({ ...row, isOwner: false as const })),
  ])
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
    columns: { id: true, name: true, email: true, image: true },
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

  // Check if already a member (the owner counts as one, implicitly).
  const [store, existing] = await Promise.all([
    db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { userId: true },
    }),
    db.query.storeMembers.findFirst({
      where: and(
        eq(storeMembers.storeId, storeId),
        eq(storeMembers.userId, targetUser.id)
      ),
    }),
  ])
  if (existing || store?.userId === targetUser.id) {
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

  return NextResponse.json({ ...member, isOwner: false, user: targetUser }, { status: 201 })
}

