"use server"

/**
 * QuickStore — members.
 *
 * Direct port of the former route handlers in
 * `app/api/quickstore/stores/[storeId]/members/**`. Same permission matrix,
 * same guards (the store owner is always the master and can never be re-roled
 * or removed, and nobody may change their own membership).
 */
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/lib/db"
import { storeMembers, stores, users } from "@/lib/db/schema"
import type { StoreMember, StoreRole } from "@/lib/db/schema"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"
import { currentSession } from "./context"
import { fail, ok, type ActionResult } from "./result"
import { jsonSafe } from "./serialize"

/** Only these columns ever leave the server for a member row. */
const USER_COLUMNS = { id: true, name: true, email: true, image: true } as const

/** A membership row plus the badge the table renders it with. */
type MemberWithOwnerFlag = StoreMember & {
  isOwner: boolean
  user: { id: string; name: string | null; email: string | null; image: string | null } | null
}

/**
 * Lists the members of a store. The owner is always first and flagged
 * `isOwner` — as a real row when they were also invited, as a synthetic one
 * when they were not — so that row can never be re-roled or removed.
 */
export async function listStoreMembers(
  storeId: string
): Promise<ActionResult<MemberWithOwnerFlag[]>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "member:view")) return fail("Forbidden", { status: 403 })

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

  if (!store) return fail("Store not found", { status: 404 })

  const others = rows.filter((row) => row.userId !== store.userId)
  // The owner row (real row when they were also invited, synthetic when not).
  const ownerRow = rows.find((row) => row.userId === store.userId)
  const owner: MemberWithOwnerFlag = ownerRow
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
        user: store.owner ?? null,
      }

  // Masters first (after the owner), then by the order they joined.
  const sorted = others.sort((a, b) => {
    if (a.role !== b.role) return a.role === "master" ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  const members: MemberWithOwnerFlag[] = [
    owner,
    ...sorted.map((row) => ({ ...row, isOwner: false as const })),
  ]

  return ok(jsonSafe(members))
}

/**
 * Invites an existing user (matched by email) as master or admin. The owner
 * counts as a member implicitly, so inviting them again answers `409`.
 */
export async function inviteStoreMember(
  storeId: string,
  email: string,
  memberRole: StoreRole = "admin"
): Promise<ActionResult<MemberWithOwnerFlag>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "member:invite")) return fail("Forbidden", { status: 403 })

  if (!email || typeof email !== "string") {
    return fail("Email is required", { status: 400 })
  }
  if (!["master", "admin"].includes(memberRole as string)) {
    return fail("Invalid role", { status: 400 })
  }

  // Find the user by email.
  const targetUser = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
    columns: { id: true, name: true, email: true, image: true },
  })
  if (!targetUser) return fail("No user found with that email", { status: 404 })

  // Prevent inviting yourself.
  if (targetUser.id === session.userId) {
    return fail("Cannot invite yourself", { status: 400 })
  }

  // Already a member? (the owner counts as one, implicitly.)
  const [store, existing] = await Promise.all([
    db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { userId: true },
    }),
    db.query.storeMembers.findFirst({
      where: and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, targetUser.id)),
    }),
  ])
  if (existing || store?.userId === targetUser.id) {
    return fail("User is already a member of this store", { status: 409 })
  }

  const [member] = await db
    .insert(storeMembers)
    .values({
      storeId,
      userId: targetUser.id,
      role: memberRole as StoreRole,
      invitedBy: session.userId,
    })
    .returning()

  return ok(jsonSafe({ ...member, isOwner: false, user: targetUser }))
}

/**
 * Loads a member and refuses the two memberships no action may touch: the store
 * owner's (always master) and the caller's own. Returns either the row or the
 * failure to pass straight back to the UI.
 */
async function loadEditableMember(
  storeId: string,
  memberId: string,
  callerId: string
): Promise<{ error: ActionResult<never> } | { member: StoreMember }> {
  const [member, store] = await Promise.all([
    db.query.storeMembers.findFirst({
      where: and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)),
    }),
    db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { userId: true },
    }),
  ])

  if (!member) return { error: fail("Member not found", { status: 404 }) }
  if (member.userId === store?.userId) {
    return { error: fail("The store owner is always the master", { status: 400 }) }
  }
  if (member.userId === callerId) {
    return { error: fail("You cannot change your own membership", { status: 400 }) }
  }

  return { member }
}

/** Changes a member's role between `master` and `admin` (master-only). */
export async function updateStoreMemberRole(
  storeId: string,
  memberId: string,
  newRole: StoreRole
): Promise<ActionResult<StoreMember>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "member:update-role")) return fail("Forbidden", { status: 403 })

  if (!["master", "admin"].includes(newRole as string)) {
    return fail("Invalid role", { status: 400 })
  }

  const loaded = await loadEditableMember(storeId, memberId, session.userId)
  if ("error" in loaded) return loaded.error

  // A no-op switch keeps `updatedAt` meaningful.
  if (loaded.member.role === newRole) return ok(jsonSafe(loaded.member))

  const [updated] = await db
    .update(storeMembers)
    .set({ role: newRole as StoreRole, updatedAt: new Date() })
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))
    .returning()

  return ok(jsonSafe(updated))
}

/** Removes a member (master-only, and never the owner or the caller). */
export async function removeStoreMember(
  storeId: string,
  memberId: string
): Promise<ActionResult<{ success: true }>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "member:remove")) return fail("Forbidden", { status: 403 })

  const loaded = await loadEditableMember(storeId, memberId, session.userId)
  if ("error" in loaded) return loaded.error

  await db
    .delete(storeMembers)
    .where(and(eq(storeMembers.id, memberId), eq(storeMembers.storeId, storeId)))

  return ok({ success: true })
}