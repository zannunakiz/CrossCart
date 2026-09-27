import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { posMembers, posRoles, posStores, type PosPermission } from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"
import { POS_ROLE_PERMISSIONS, hasPosPermission } from "@/lib/pos/permissions"

export async function getPosPermissions(userId: string, storeId: string): Promise<readonly string[]> {
  // A malformed id can never match a row — and would make Postgres raise 22P02 —
  // so it yields no permissions, which every caller already maps to 403/redirect.
  if (!isUuid(storeId)) return []

  const [store] = await db.select({ ownerId: posStores.ownerId }).from(posStores).where(eq(posStores.id, storeId)).limit(1)
  if (!store) return []
  if (store.ownerId === userId) return POS_ROLE_PERMISSIONS.owner
  const [member] = await db.select({ active: posMembers.active, permissions: posRoles.permissions, systemRole: posRoles.systemRole }).from(posMembers).innerJoin(posRoles, eq(posMembers.roleId, posRoles.id)).where(and(eq(posMembers.storeId, storeId), eq(posMembers.userId, userId))).limit(1)
  if (!member?.active) return []
  return member.permissions.length ? member.permissions : (member.systemRole ? POS_ROLE_PERMISSIONS[member.systemRole] ?? [] : [])
}

export async function assertPosPermission(userId: string, storeId: string, permission: PosPermission) {
  const permissions = await getPosPermissions(userId, storeId)
  if (!hasPosPermission(permissions, permission)) throw new Error("FORBIDDEN")
  return permissions
}

export function code(length = 8) { return crypto.randomUUID().replace(/-/g, "").slice(0, length).toUpperCase() }
