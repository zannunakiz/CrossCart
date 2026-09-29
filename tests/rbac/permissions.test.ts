/**
 * RBAC tests — the permission matrix (pure mocks, no DB, no session).
 *
 * `lib/quickstore/permissions.ts` is the single source of truth for
 * "who may do what". These tests pin the whole matrix down so a role can never
 * silently gain or lose a capability.
 */
import {
  ALL_PERMISSIONS,
  canCreateSale,
  canDeleteStore,
  canEditStoreCredential,
  canEditStoreDetails,
  canEditStoreStatus,
  canManageItems,
  canManageMembers,
  canViewSales,
  canViewStore,
  getPermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type Permission,
} from "@/lib/quickstore/permissions"
import type { StoreRole } from "@/lib/db/schema"

/** The documented matrix — the code under test must match this exactly. */
const MATRIX: Record<StoreRole, Permission[]> = {
  master: [...ALL_PERMISSIONS],
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

const GUEST_ROLES: (StoreRole | null | undefined)[] = [null, undefined]

describe("permission matrix", () => {
  test("ALL_PERMISSIONS is complete and free of duplicates", () => {
    expect(ALL_PERMISSIONS).toHaveLength(16)
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length)
  })

  test("master holds every permission — full control of the store", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission("master", permission)).toBe(true)
    }
    expect(getPermissions("master")).toHaveLength(ALL_PERMISSIONS.length)
  })

  test("admin holds exactly the documented day-to-day permissions", () => {
    for (const permission of ALL_PERMISSIONS) {
      const expected = MATRIX.admin.includes(permission)
      expect([permission, hasPermission("admin", permission)]).toEqual([permission, expected])
    }
    // The nine admin rights and nothing more.
    expect([...getPermissions("admin")].sort()).toEqual([...MATRIX.admin].sort())
  })

  test("admin is denied every privileged right", () => {
    const denied: Permission[] = [
      "store:update-details",
      "store:update-credential",
      "store:delete",
      "member:invite",
      "member:update-role",
      "member:remove",
      "sale:void",
    ]
    for (const permission of denied) {
      expect(hasPermission("admin", permission)).toBe(false)
    }
  })

  test("guests (no role) are denied everything — private stores stay private", () => {
    for (const role of GUEST_ROLES) {
      for (const permission of ALL_PERMISSIONS) {
        expect(hasPermission(role, permission)).toBe(false)
      }
      expect(getPermissions(role)).toEqual([])
    }
  })

  test("an unknown role value can never sneak in (defensive lookup)", () => {
    expect(hasPermission("superadmin" as StoreRole, "store:delete")).toBe(false)
    expect(hasPermission("owner" as StoreRole, "item:create")).toBe(false)
    expect(getPermissions("superadmin" as StoreRole)).toEqual([])
  })
})

describe("hasAnyPermission / hasAllPermissions", () => {
  test("any: at least one of the listed rights", () => {
    expect(hasAnyPermission("admin", ["store:delete", "item:create"])).toBe(true)
    expect(hasAnyPermission("admin", ["store:delete", "member:invite"])).toBe(false)
    expect(hasAnyPermission(null, ["store:view"])).toBe(false)
    expect(hasAnyPermission("master", ["store:view", "store:delete"])).toBe(true)
  })

  test("all: every listed right must be held", () => {
    expect(hasAllPermissions("master", ["store:delete", "member:remove"])).toBe(true)
    expect(hasAllPermissions("admin", ["item:view", "item:create"])).toBe(true)
    expect(hasAllPermissions("admin", ["item:view", "store:delete"])).toBe(false)
    expect(hasAllPermissions(null, ["store:view"])).toBe(false)
  })
})

describe("named helpers (what the UI gates on)", () => {
  test("store helpers: details/credential/delete are master-only", () => {
    expect(canViewStore("master")).toBe(true)
    expect(canViewStore("admin")).toBe(true)
    expect(canViewStore(null)).toBe(false)

    expect(canEditStoreDetails("master")).toBe(true)
    expect(canEditStoreDetails("admin")).toBe(false)

    expect(canEditStoreStatus("master")).toBe(true)
    expect(canEditStoreStatus("admin")).toBe(true) // open/close is day-to-day

    expect(canEditStoreCredential("master")).toBe(true)
    expect(canEditStoreCredential("admin")).toBe(false)

    expect(canDeleteStore("master")).toBe(true)
    expect(canDeleteStore("admin")).toBe(false)
    expect(canDeleteStore(null)).toBe(false)
  })

  test("item helpers: both roles may manage the catalog, nobody else", () => {
    expect(canManageItems("master")).toBe(true)
    expect(canManageItems("admin")).toBe(true)
    expect(canManageItems(null)).toBe(false)
  })

  test("member helpers: membership administration is master-only", () => {
    expect(canManageMembers("master")).toBe(true)
    expect(canManageMembers("admin")).toBe(false)
    expect(canManageMembers(null)).toBe(false)
  })

  test("sale helpers: both roles may ring up and read sales", () => {
    expect(canCreateSale("master")).toBe(true)
    expect(canCreateSale("admin")).toBe(true)
    expect(canCreateSale(null)).toBe(false)
    expect(canViewSales("master")).toBe(true)
    expect(canViewSales("admin")).toBe(true)
    expect(canViewSales(null)).toBe(false)
  })
})
