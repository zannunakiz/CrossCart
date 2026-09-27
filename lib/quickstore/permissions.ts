/**
 * QuickStore RBAC — permission-based access control.
 *
 * Design goals:
 *  - Industry standard `resource:action` permissions. Call sites never branch on
 *    a role NAME, so a role can gain/lose a capability by editing the matrix
 *    below — no component or API route has to change.
 *  - Scalable: adding a permission is additive (union + matrix), and future
 *    roles (e.g. `staff`, `viewer`) or per-member permission overrides can be
 *    layered on without a schema or call-site rewrite.
 *  - Auditable: this file is the single source of truth for "who may do what".
 *
 * Current matrix:
 *  Permission                   | Master | Admin | Guest (not a member)
 *  ─────────────────────────────|--------|-------|─────────────────────
 *  store:view                   |   ✅   |   ✅  |   ❌ (private stores)
 *  store:update-details         |   ✅   |   ❌  |   ❌ (name, description)
 *  store:update-status          |   ✅   |   ✅  |   ❌ (open / closed)
 *  store:update-credential      |   ✅   |   ❌  |   ❌ (payment QR)
 *  store:delete                 |   ✅   |   ❌  |   ❌ (or the store owner)
 *  member:view                  |   ✅   |   ✅  |   ❌
 *  member:invite                |   ✅   |   ❌  |   ❌
 *  member:update-role           |   ✅   |   ❌  |   ❌
 *  member:remove                |   ✅   |   ❌  |   ❌
 *  item:view                    |   ✅   |   ✅  |   ❌
 *  item:create/update/delete    |   ✅   |   ✅  |   ❌ (admin: full catalog)
 *  sale:view                    |   ✅   |   ✅  |   ❌
 *  sale:create                  |   ✅   |   ✅  |   ❌
 *  sale:void                    |   ✅   |   ❌  |   ❌ (reserved — no UI yet)
 */

import type { StoreRole } from "@/lib/db/schema"

export type Permission =
  // Store profile + credentials
  | "store:view"
  | "store:update-details"
  | "store:update-status"
  | "store:update-credential"
  | "store:delete"
  // Membership administration
  | "member:view"
  | "member:invite"
  | "member:update-role"
  | "member:remove"
  // Catalog
  | "item:view"
  | "item:create"
  | "item:update"
  | "item:delete"
  // Sales
  | "sale:view"
  | "sale:create"
  | "sale:void"

/** Every permission — handy for roles that need full control. */
export const ALL_PERMISSIONS: readonly Permission[] = [
  "store:view",
  "store:update-details",
  "store:update-status",
  "store:update-credential",
  "store:delete",
  "member:view",
  "member:invite",
  "member:update-role",
  "member:remove",
  "item:view",
  "item:create",
  "item:update",
  "item:delete",
  "sale:view",
  "sale:create",
  "sale:void",
]

/**
 * Full permission set per role.
 *
 * Master is the store owner/creator: full control including credentials,
 * membership and deletion. Admin runs the day-to-day store — the catalog, the
 * cashier and the open/close status — but may not change store details, the
 * payment credential or the member list. Granting admin more later is a
 * one-line change in this matrix.
 */
const ROLE_PERMISSIONS: Record<StoreRole, readonly Permission[]> = {
  master: ALL_PERMISSIONS,
  admin: [
    "store:view",
    "store:update-status",
    "member:view",
    "item:view",
    "item:create",
    "item:update",
    "item:delete",
    "sale:view",
    "sale:create",
  ],
}

/**
 * Check whether a given role has a specific permission.
 *
 * @param role       - The member's role, or null/undefined for guests.
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

/** True when the role holds at least one of the given permissions. */
export function hasAnyPermission(
  role: StoreRole | null | undefined,
  permissions: readonly Permission[]
): boolean {
  return permissions.some((permission) => hasPermission(role, permission))
}

/** True when the role holds every one of the given permissions. */
export function hasAllPermissions(
  role: StoreRole | null | undefined,
  permissions: readonly Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(role, permission))
}

/** Convenience: returns all permissions for a role (for UI/feature flags). */
export function getPermissions(
  role: StoreRole | null | undefined
): readonly Permission[] {
  if (!role) return []
  return ROLE_PERMISSIONS[role] ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// Named helpers — thin, readable wrappers over `hasPermission`.
// ─────────────────────────────────────────────────────────────────────────────

/** True if the role can see a store and its data. */
export const canViewStore = (role: StoreRole | null | undefined) =>
  hasPermission(role, "store:view")

/** True if the role can edit store details (name, description). */
export const canEditStoreDetails = (role: StoreRole | null | undefined) =>
  hasPermission(role, "store:update-details")

/** True if the role can open / close the store. */
export const canEditStoreStatus = (role: StoreRole | null | undefined) =>
  hasPermission(role, "store:update-status")

/** True if the role can change the store credential (payment QR). */
export const canEditStoreCredential = (role: StoreRole | null | undefined) =>
  hasPermission(role, "store:update-credential")

/** True if the role can delete the entire store. */
export const canDeleteStore = (role: StoreRole | null | undefined) =>
  hasPermission(role, "store:delete")

/** True if the role can manage (add / edit / delete) items. */
export const canManageItems = (role: StoreRole | null | undefined) =>
  hasAllPermissions(role, ["item:create", "item:update", "item:delete"])

/** True if the role can invite members, change their roles or remove them. */
export const canManageMembers = (role: StoreRole | null | undefined) =>
  hasAnyPermission(role, ["member:invite", "member:update-role", "member:remove"])

/** True if the role can ring up sales in the cashier (QuickStore). */
export const canCreateSale = (role: StoreRole | null | undefined) =>
  hasPermission(role, "sale:create")

/** True if the role can read the sales history of a store. */
export const canViewSales = (role: StoreRole | null | undefined) =>
  hasPermission(role, "sale:view")
