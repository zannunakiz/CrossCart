/**
 * RBAC tests — the QuickStore tab strip.
 *
 * Which tabs a role may open is decided here (not in the page or the sidebar),
 * so the URL, the page and the sidebar can never disagree about access.
 */
import {
  DEFAULT_STORE_TAB,
  STORE_TABS,
  allowedStoreTabs,
  parseStoreTab,
  resolveStoreTab,
  storeTabUrlParams,
} from "@/lib/quickstore/store-tabs"
import { hasPermission } from "@/lib/quickstore/permissions"

describe("allowedStoreTabs", () => {
  test("master opens every tab, in strip order", () => {
    expect(allowedStoreTabs("master")).toEqual(["store", "items", "history", "members"])
  })

  test("admin opens every tab as well (holds all four view permissions)", () => {
    expect(allowedStoreTabs("admin")).toEqual(["store", "items", "history", "members"])
  })

  test("a guest (not a member) opens no tab at all", () => {
    expect(allowedStoreTabs(null)).toEqual([])
    expect(allowedStoreTabs(undefined)).toEqual([])
  })

  test("every tab permission is a real permission from the matrix", () => {
    for (const tab of STORE_TABS) {
      expect(hasPermission("master", permissionOf(tab))).toBe(true)
      expect(hasPermission(null, permissionOf(tab))).toBe(false)
    }
  })
})

function permissionOf(tab: (typeof STORE_TABS)[number]) {
  const map = {
    store: "store:view",
    items: "item:view",
    history: "sale:view",
    members: "member:view",
  } as const
  return map[tab]
}

describe("parseStoreTab / resolveStoreTab", () => {
  test("reads the tab from the URL, unknown values are null", () => {
    expect(parseStoreTab(new URLSearchParams("tab=items"))).toBe("items")
    expect(parseStoreTab(new URLSearchParams("tab=nope"))).toBeNull()
    expect(parseStoreTab(new URLSearchParams(""))).toBeNull()
  })

  test("the URL wins whenever the role may see that tab", () => {
    const allowed = allowedStoreTabs("master")
    expect(resolveStoreTab(new URLSearchParams("tab=members"), allowed)).toBe("members")
  })

  test("a shared link to a hidden tab falls back to the first allowed tab", () => {
    // A guest may open nothing → default tab (the page itself then guards it).
    expect(resolveStoreTab(new URLSearchParams("tab=members"), allowedStoreTabs(null))).toBe(
      DEFAULT_STORE_TAB
    )
    expect(resolveStoreTab(new URLSearchParams("tab=nope"), ["items"])).toBe("items")
  })

  test("a clean URL lands on the default tab", () => {
    expect(resolveStoreTab(new URLSearchParams(""), allowedStoreTabs("master"))).toBe(
      DEFAULT_STORE_TAB
    )
    expect(DEFAULT_STORE_TAB).toBe("store")
  })
})

describe("storeTabUrlParams", () => {
  test("sets the tab while preserving the other query keys", () => {
    const params = storeTabUrlParams(new URLSearchParams("q=tea&page=2"), "history")
    expect(params.get("tab")).toBe("history")
    expect(params.get("q")).toBe("tea")
    expect(params.get("page")).toBe("2")
  })
})
