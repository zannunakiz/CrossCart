"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  History,
  Loader2,
  Package,
  Settings,
  ShoppingCart,
  Store,
  ToggleLeft,
  ToggleRight,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav"
import { HistoryTab } from "@/components/quickstore/history-tab"
import { ItemsTab } from "@/components/quickstore/items-tab"
import { MembersTab } from "@/components/quickstore/members-tab"
import { StoreSettingsTab } from "@/components/quickstore/store-settings-tab"
import { hasPermission } from "@/lib/quickstore/permissions"
import { useTranslation } from "@/lib/i18n"
import type { StoreRole } from "@/lib/db/schema"
import type { Store as StoreType } from "@/lib/db/schema"

interface StoreWithRole extends StoreType {
  role: StoreRole
  /** True when the signed-in user is the store creator (owner). */
  isOwner?: boolean
}

type StoreTab = "items" | "history" | "members" | "settings"

export default function StoreDetailPage() {
  const { storeId } = useParams<{ storeId: string }>()
  const router = useRouter()
  const { t } = useTranslation()

  const [store, setStore] = useState<StoreWithRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StoreTab>("items")

  const fetchStore = useCallback(async () => {
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}`)
      if (res.status === 403 || res.status === 401) {
        router.replace("/quickstore")
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
        <Store className="size-12 text-muted-foreground" />
        <p className="font-semibold">{t("Store not found")}</p>
        <Link href="/quickstore">
          <Button variant="outline" size="sm">{t("Back to Quick Store")}</Button>
        </Link>
      </div>
    )
  }

  // Master (store:delete) or the store owner — the only ones who may delete it.
  const canDeleteStore = hasPermission(store.role, "store:delete") || !!store.isOwner
  // Store settings follow the RBAC matrix: master + admin have store:edit.
  const canEditStore = hasPermission(store.role, "store:edit")

  const tabItems: TabNavItem[] = [
    { value: "items", label: t("Items"), icon: Package },
    { value: "history", label: t("History"), icon: History },
    { value: "members", label: t("Members"), icon: Users },
  ]

  if (canEditStore) {
    tabItems.push({ value: "settings", label: t("Settings"), icon: Settings })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/quickstore" aria-label={t("Back to Quick Store")}>
            <Button variant="ghost" size="icon" className="mt-0.5 shrink-0">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight">{store.name}</h1>
              <Badge
                variant={store.open ? "default" : "secondary"}
                className="gap-1 text-3xs"
              >
                {store.open ? (
                  <ToggleRight className="size-3" />
                ) : (
                  <ToggleLeft className="size-3" />
                )}
                {store.open ? t("Open") : t("Closed")}
              </Badge>
              <Badge variant="outline" className="text-3xs font-semibold uppercase tracking-wide">
                {store.role}
              </Badge>
            </div>
            {store.description && (
              <p className="mt-1 text-sm text-muted-foreground">{store.description}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {hasPermission(store.role, "sale:create") && (
            <Link href={`/quickstore/${storeId}/cashier`}>
              <Button id="open-cashier-btn" size="sm" className="gap-2">
                <ShoppingCart className="size-4" />
                {t("Cashier")}
              </Button>
            </Link>
          )}
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
        {tab === "items" && <ItemsTab storeId={storeId} role={store.role} />}

        {tab === "history" && <HistoryTab storeId={storeId} />}

        {tab === "members" && <MembersTab storeId={storeId} role={store.role} />}

        {canEditStore && tab === "settings" && (
          <StoreSettingsTab
            store={store}
            canDelete={canDeleteStore}
            onUpdated={(updated) => setStore({ ...updated, role: store.role })}
          />
        )}
      </div>
    </div>
  )
}
