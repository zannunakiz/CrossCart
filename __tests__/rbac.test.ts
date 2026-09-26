import { describe, it, expect } from "vitest"
import {
  canDeleteStore,
  canEditStore,
  canManageItems,
  canManageMembers,
  getPermissions,
  hasPermission,
} from "@/lib/quickstore/permissions"
import type { StoreRole } from "@/lib/db/schema"

describe("QuickStore RBAC Permissions", () => {
  describe("Guest (not a member / null role)", () => {
    it("should have no permissions", () => {
      expect(hasPermission(null, "store:view")).toBe(false)
      expect(hasPermission(undefined, "item:create")).toBe(false)
      expect(getPermissions(null)).toEqual([])
    })

    it("cannot perform any management actions", () => {
      expect(canDeleteStore(null)).toBe(false)
      expect(canEditStore(null)).toBe(false)
      expect(canManageItems(null)).toBe(false)
      expect(canManageMembers(null)).toBe(false)
    })
  })

  describe("Admin Role", () => {
    const role: StoreRole = "admin"

    it("can view store and manage items", () => {
      expect(hasPermission(role, "store:view")).toBe(true)
      expect(hasPermission(role, "item:create")).toBe(true)
      expect(hasPermission(role, "item:edit")).toBe(true)
      expect(hasPermission(role, "item:delete")).toBe(true)
      expect(canManageItems(role)).toBe(true)
    })

    it("can edit store details", () => {
      expect(hasPermission(role, "store:edit")).toBe(true)
      expect(canEditStore(role)).toBe(true)
    })

    it("CANNOT delete store or manage members", () => {
      expect(hasPermission(role, "store:delete")).toBe(false)
      expect(canDeleteStore(role)).toBe(false)

      expect(hasPermission(role, "member:invite")).toBe(false)
      expect(hasPermission(role, "member:remove")).toBe(false)
      expect(hasPermission(role, "member:change_role")).toBe(false)
      expect(canManageMembers(role)).toBe(false)
    })
  })

  describe("Master Role", () => {
    const role: StoreRole = "master"

    it("has all permissions", () => {
      expect(hasPermission(role, "store:view")).toBe(true)
      expect(hasPermission(role, "store:edit")).toBe(true)
      expect(hasPermission(role, "store:delete")).toBe(true)
      
      expect(hasPermission(role, "item:create")).toBe(true)
      expect(hasPermission(role, "item:edit")).toBe(true)
      expect(hasPermission(role, "item:delete")).toBe(true)

      expect(hasPermission(role, "member:invite")).toBe(true)
      expect(hasPermission(role, "member:remove")).toBe(true)
      expect(hasPermission(role, "member:change_role")).toBe(true)
    })

    it("returns true for all helper functions", () => {
      expect(canDeleteStore(role)).toBe(true)
      expect(canEditStore(role)).toBe(true)
      expect(canManageItems(role)).toBe(true)
      expect(canManageMembers(role)).toBe(true)
    })
  })
})
