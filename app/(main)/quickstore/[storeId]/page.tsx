"use client"

import { History, Loader2, Package, ShoppingCart, Store as StoreIcon, Users } from "lucide-react"
import Link from "next/link"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { HistoryTab } from "@/components/quickstore/history-tab"
import { ItemsTab } from "@/components/quickstore/items-tab"
import { MembersTab } from "@/components/quickstore/members-tab"
import { useQuickStoreHeader } from "@/components/quickstore/store-header-context"
import { StoreStatusLine } from "@/components/quickstore/store-status-line"
import { StoreSettingsTab } from "@/components/quickstore/store-settings-tab"
import { Button } from "@/components/ui/button"
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav"
import type { StoreRole, Store as StoreType } from "@/lib/db/schema"
import { useTranslation } from "@/lib/i18n"
import { hasPermission } from "@/lib/quickstore/permissions"
import {
  parseStoreTab,
  resolveStoreTab,
  storeTabUrlParams,
  type StoreTab,
} from "@/lib/quickstore/store-tabs"

interface StoreWithRole extends StoreType {
  role: StoreRole
  /** True when the signed-in user is the store creator (owner). */
  isOwner?: boolean
}

/**
 * Mirrors a `?tab=` the page refuses to render back into the URL.
 *
 * A hand-typed or stale link can ask for a tab that does not exist
 * (`?tab=blabla`) or one this role may not open. The page already falls back to
 * a real tab, but the address bar kept the old value — so the URL is rewritten
 * to the tab that is actually on screen. Nothing is written when the param is
 * simply missing, so a plain `/quickstore/[id]` link stays clean.
 *
 * A component of its own so the effect runs unconditionally even though the
 * page returns early while it is still loading.
 */
function TabUrlSync({ tab }: { tab: StoreTab }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const requested = parseStoreTab(params)
    if (requested === null || requested === tab) return
    router.replace(`${pathname}?${storeTabUrlParams(params, tab).toString()}`, { scroll: false })
  }, [searchParams, pathname, router, tab])

  return null
}

/**
 * `useSearchParams` is a Client Component hook, so the view that reads the open
 * tab is wrapped in a Suspense boundary (see the official docs) — the tab
 * itself comes from `?tab=…`, which is what makes a refresh stay on it.
 */
export default function StoreDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <StoreDetailView />
    </Suspense>
  )
}

function StoreDetailView() {
  const { storeId } = useParams<{ storeId: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const { setHeader } = useQuickStoreHeader()

  const [store, setStore] = useState<StoreWithRole | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStore = useCallback(async () => {
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}`)
      // No access → store list. Unknown store id → the shared 404 screen.
      if (res.status === 403 || res.status === 401) {
        router.replace("/quickstore")
        return
      }
      if (res.status === 404) {
        router.replace("/not-found")
        return
      }
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStore(data)
    } catch {
      toast.error(t("Failed to load store"))
    } finally {
      setLoading(false)
    }
  }, [storeId, router, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStore()
  }, [fetchStore])

  /**
   * The navbar renders this store's breadcrumb (`Quick Store › {name}`) for
   * every route under `/quickstore/[storeId]` on desktop only, so the page
   * itself only prints the name on mobile (above the cashier / status row).
   */
  useEffect(() => {
    if (!store) return
    setHeader({ storeId: store.id, name: store.name, open: store.open, role: store.role })
  }, [store, setHeader])

  useEffect(() => () => setHeader(null), [setHeader])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!store) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <StoreIcon className="size-12 text-muted-foreground" />
        <p className="font-semibold">{t("Store not found")}</p>
        <Link href="/quickstore">
          <Button variant="outline" size="sm">{t("Back to Quick Store")}</Button>
        </Link>
      </div>
    )
  }

  // Master (store:delete) or the store owner — the only ones who may delete it.
  const canDeleteStore = hasPermission(store.role, "store:delete") || !!store.isOwner
  const canCreateSale = hasPermission(store.role, "sale:create")

  // Every tab is permission-gated; the Store tab itself is read-only for roles
  // without `store:update-*` (see StoreSettingsTab).
  const tabItems: TabNavItem[] = []

  if (hasPermission(store.role, "store:view")) {
    tabItems.push({ value: "store", label: t("Store"), icon: StoreIcon })
  }
  if (hasPermission(store.role, "item:view")) {
    tabItems.push({ value: "items", label: t("Items"), icon: Package })
  }
  if (hasPermission(store.role, "sale:view")) {
    tabItems.push({ value: "history", label: t("History"), icon: History })
  }
  if (hasPermission(store.role, "member:view")) {
    tabItems.push({ value: "members", label: t("Members"), icon: Users })
  }

  // The URL owns the open tab; a tab the role cannot see falls back to the
  // first one they can (a shared link may point at a hidden tab).
  const allowedTabs = tabItems
    .map((item) => item.value)
    .filter((value): value is StoreTab => value !== undefined)
  const tab = resolveStoreTab(new URLSearchParams(searchParams.toString()), allowedTabs)

  /** Open a tab by rewriting the query string, so the URL stays shareable. */
  const selectTab = (value: string) => {
    const params = storeTabUrlParams(new URLSearchParams(searchParams.toString()), value as StoreTab)
    // Paging belongs to the tab that owns it: the Items and History tabs share the
    // `page` / `limit` keys, so carrying them over would open the next tab on a
    // page the operator never paged to. Switching tabs starts at page 1 again.
    if (value !== tab) {
      params.delete("page")
      params.delete("limit")
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div>
      {/* Mobile: the navbar hides the store name, so the page prints it here —
          right above the cashier / status row. Light weight on purpose. */}
      <h1 className="mb-2 truncate text-xl font-light tracking-tight text-foreground sm:hidden">
        {store.name}
      </h1>

      {/* Full width row: Cashier button di kiri, Status & Role di kanan.
          `#open-cashier-btn` is the single, stable hook for QA/automation (it used
          to exist twice, via the old badge bar) and opens the register in its own
          tab, so the store tabs stay where they are. */}
      <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3">
        <div>
          {canCreateSale && (
            <Link
              href={`/quickstore/${store.id}/cashier`}
              id="open-cashier-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" className="gap-1.5">
                <ShoppingCart className="size-3.5" />
                <span>{t("To Cashier")}</span>
              </Button>
            </Link>
          )}
        </div>

        <StoreStatusLine open={store.open} role={store.role} />
      </div>

      {/* Tabs — the shared underlined nav, so every store screen looks the same. */}
      <TabUrlSync tab={tab} />
      <TabNav
        items={tabItems}
        activeValue={tab}
        onSelect={selectTab}
        ariaLabel={t("Store navigation")}
        layoutId={`quickstore-tab-${storeId}`}
      />

      <div className="mt-4">
        {tab === "store" && (
          <StoreSettingsTab
            store={store}
            role={store.role}
            isOwner={!!store.isOwner}
            canDelete={canDeleteStore}
            onUpdated={(updated) => setStore({ ...updated, role: store.role, isOwner: store.isOwner })}
          />
        )}

        {tab === "items" && <ItemsTab storeId={storeId} role={store.role} />}

        {tab === "history" && <HistoryTab storeId={storeId} />}

        {tab === "members" && <MembersTab storeId={storeId} role={store.role} />}
      </div>
    </div>
  )
}