/**
 * QuickStore RBAC Permission System
 *
 * Design goals:
 *  - Scalable: add new permissions without touching call-sites.
 *  - Centralised: one place to audit all access rules.
 *  - Type-safe: TypeScript ensures exhaustive role handling.
 *
 * Permission matrix:
 *  Action                | Master | Admin | Guest (not a member)
 *  ──────────────────────|--------|-------|─────────────────────
 *  Delete store          |  ✅    |  ❌   |  ❌
 *  Edit store details    |  ✅    |  ✅   |  ❌
 *  Invite / remove member|  ✅    |  ❌   |  ❌
 *  Change member role    |  ✅    |  ❌   |  ❌
 *  Add / edit / del item |  ✅    |  ✅   |  ❌
 *  View store + items    |  ✅    |  ✅   |  ❌ (private stores)
 */

import type { StoreRole } from "@/lib/db/schema"

export type Permission =
  | "store:delete"
  | "store:edit"
  | "member:invite"
  | "member:remove"
  | "member:change_role"
  | "item:create"
  | "item:edit"
  | "item:delete"
  | "store:view"

/**
 * Full permission set per role.
 * Extend by adding new Permission literals and mapping them here.
 */
const ROLE_PERMISSIONS: Record<StoreRole, Permission[]> = {
  master: [
    "store:delete",
    "store:edit",
    "member:invite",
    "member:remove",
    "member:change_role",
    "item:create",
    "item:edit",
    "item:delete",
    "store:view",
  ],
  admin: [
    "store:edit",
    "item:create",
    "item:edit",
    "item:delete",
    "store:view",
  ],
}

/**
 * Check whether a given role has a specific permission.
 *
 * @param role      - The member's role, or null/undefined for guests.
 * @param permission - The action being checked.
 * @returns true if allowed, false otherwise.
 */
export function hasPermission(
  role: StoreRole | null | undefined,
  permission: Permission
): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/**
 * Convenience: returns all permissions for a role.
 * Useful for populating frontend UI.
 */
export function getPermissions(role: StoreRole | null | undefined): Permission[] {
  if (!role) return []
  return ROLE_PERMISSIONS[role] ?? []
}

/** True if the role can delete the entire store. */
export const canDeleteStore = (role: StoreRole | null | undefined) =>
  hasPermission(role, "store:delete")

/** True if the role can edit store metadata / toggle open status. */
export const canEditStore = (role: StoreRole | null | undefined) =>
  hasPermission(role, "store:edit")

/** True if the role can manage (add / edit / delete) items. */
export const canManageItems = (role: StoreRole | null | undefined) =>
  hasPermission(role, "item:create") &&
  hasPermission(role, "item:edit") &&
  hasPermission(role, "item:delete")

/** True if the role can invite members or change their roles. */
export const canManageMembers = (role: StoreRole | null | undefined) =>
  hasPermission(role, "member:invite")
