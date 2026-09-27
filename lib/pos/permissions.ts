import type { PosPermission } from "@/lib/db/schema"

export const POS_ROLE_PERMISSIONS: Record<string, readonly PosPermission[]> = {
  owner: ["store:manage", "catalog:read", "catalog:write", "order:read", "order:create", "order:manage", "payment:collect", "kitchen:read", "kitchen:update", "inventory:read", "inventory:write", "member:manage", "report:read"],
  manager: ["catalog:read", "catalog:write", "order:read", "order:create", "order:manage", "payment:collect", "kitchen:read", "kitchen:update", "inventory:read", "inventory:write", "member:manage", "report:read"],
  cashier: ["catalog:read", "order:read", "order:create", "order:manage", "payment:collect"],
  kitchen: ["catalog:read", "order:read", "kitchen:read", "kitchen:update"],
  inventory: ["catalog:read", "inventory:read", "inventory:write"],
  viewer: ["catalog:read", "order:read", "report:read"],
}

/** Custom roles store an explicit permission array in `pos_roles.permissions`. */
export function hasPosPermission(permissions: readonly string[], permission: PosPermission) {
  return permissions.includes(permission)
}
