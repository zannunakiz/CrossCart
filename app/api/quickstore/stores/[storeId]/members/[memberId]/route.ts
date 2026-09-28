/**
 * PUT    /api/quickstore/stores/[storeId]/members/[memberId]  — change role
 * DELETE /api/quickstore/stores/[storeId]/members/[memberId]  — remove member
 *
 * Both are master-only and refuse to touch the store owner (always master) or
 * the caller's own membership, so a store can never be left without a manager.
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { storeMembers, stores } from "@/lib/db/schema"
import type { StoreRole } from "@/lib/db/schema"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string; memberId: string }> }

/**
 * Loads the member and refuses the two memberships no API may touch.
 * Returns the member row, or the response to send back.
 */
async function loadEditableMember(
  storeId: string,
  memberId: string,
  callerId: string
): Promise<
  | { error: NextResponse }
  | { member: typeof storeMembers.$inferSelect }
> {
  const [member, store] = await Promise.all([
    db.query.storeMembers.findFirst({
      where: and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)),
    }),
    db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { userId: true },
    }),
  ])

  if (!member) {
    return { error: NextResponse.json({ error: "Member not found" }, { status: 404 }) }
  }
  if (member.userId === store?.userId) {
    return {
      error: NextResponse.json(
        { error: "The store owner is always the master" },
        { status: 400 }
      ),
    }
  }
  if (member.userId === callerId) {
    return {
      error: NextResponse.json(
        { error: "You cannot change your own membership" },
        { status: 400 }
      ),
    }
  }

  return { member }
}

// ── PUT — change role ────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId, memberId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "member:update-role")) {
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

  const loaded = await loadEditableMember(storeId, memberId, session.user.id)
  if ("error" in loaded) return loaded.error

  // A no-op switch keeps `updatedAt` meaningful.
  if (loaded.member.role === newRole) {
    return NextResponse.json(loaded.member)
  }

  const [updated] = await db
    .update(storeMembers)
    .set({ role: newRole as StoreRole, updatedAt: new Date() })
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

  const loaded = await loadEditableMember(storeId, memberId, session.user.id)
  if ("error" in loaded) return loaded.error

  await db
    .delete(storeMembers)
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))

  return NextResponse.json({ success: true })
}

