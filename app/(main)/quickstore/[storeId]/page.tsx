"use client"

import { History, Loader2, Package, ShoppingCart, Store as StoreIcon, Users } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { HistoryTab } from "@/components/quickstore/history-tab"
import { ItemsTab } from "@/components/quickstore/items-tab"
import { MembersTab } from "@/components/quickstore/members-tab"
import { useQuickStoreHeader } from "@/components/quickstore/store-header-context"
import { StoreSettingsTab } from "@/components/quickstore/store-settings-tab"
import { Button } from "@/components/ui/button"
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav"
import type { StoreRole, Store as StoreType } from "@/lib/db/schema"
import { useTranslation } from "@/lib/i18n"
import { hasPermission } from "@/lib/quickstore/permissions"

interface StoreWithRole extends StoreType {
  role: StoreRole
  /** True when the signed-in user is the store creator (owner). */
  isOwner?: boolean
}

/** Store tab first: it is the landing view of every store. */
type StoreTab = "store" | "items" | "history" | "members"

export default function StoreDetailPage() {
  const { storeId } = useParams<{ storeId: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const { setHeader } = useQuickStoreHeader()

  const [store, setStore] = useState<StoreWithRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StoreTab>("store")

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
   * The navbar renders this store's breadcrumb (`Quick Store › {name} {status}
   * {role}`) for every route under `/quickstore/[storeId]`, so the page itself
   * no longer needs a title, description or badge header.
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

  return (
    <div>
      {/* Full width row: Cashier button di kiri, Status & Role di kanan */}
      <div className="mb-4 flex w-full items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>
          {canCreateSale && (
            <Link href={`/quickstore/${store.id}/cashier`} id="open-cashier-btn">
              <Button size="sm" className="gap-1.5">
                <ShoppingCart className="size-3.5" />
                <span>{t("Cashier")}</span>
              </Button>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div>
            STATUS:{" "}
            <span className={store.open ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>
              {store.open ? "open" : "closed"}
            </span>
          </div>
          <span>•</span>
          <div>
            ROLE:{" "}
            <span className="font-medium text-foreground">
              {store.role.toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs — same underlined nav as POS so both screens stay identical. */}
      <TabNav
        items={tabItems}
        activeValue={tab}
        onSelect={(value) => setTab(value as StoreTab)}
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