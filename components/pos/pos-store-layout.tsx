"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ChefHat,
  ChevronLeft,
  ClipboardList,
  Package,
  QrCode,
  Settings,
  ShoppingBag,
  Tag,
  Users,
} from "lucide-react"

import { ShareOrderDialog } from "@/components/pos/share-order-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n"

type Store = {
  id: string
  name: string
  slug: string
  currency: "IDR" | "USD"
  isOpen: boolean
  ownerId: string
}

type Permissions = {
  canManage: boolean
  canWriteCatalog: boolean
  canManageMembers: boolean
  canReadReports: boolean
  canReadInventory: boolean
  isOwner: boolean
}

export function PosStoreLayout({
  store,
  permissions,
  children,
}: {
  store: Store
  permissions: Permissions
  children: React.ReactNode
}) {
  const lang = useLanguage()
  const id = lang === "ID"
  const base = `/pos/${store.id}`
  const [shareOpen, setShareOpen] = useState(false)

  const tabs: (TabNavItem & { show: boolean })[] = [
    {
      href: `${base}/cashier`,
      label: id ? "Kasir" : "Cashier",
      icon: ShoppingBag,
      show: true,
    },
    {
      href: `${base}/catalog`,
      label: id ? "Katalog" : "Catalog",
      icon: Package,
      show: true,
    },
    {
      href: `${base}/categories`,
      label: id ? "Kategori" : "Categories",
      icon: Tag,
      show: permissions.canWriteCatalog,
    },
    {
      href: `${base}/kitchen`,
      label: id ? "Dapur" : "Kitchen",
      icon: ChefHat,
      show: true,
    },
    {
      href: `${base}/orders`,
      label: id ? "Pesanan" : "Orders",
      icon: ClipboardList,
      show: permissions.canReadReports,
    },
    {
      href: `${base}/members`,
      label: id ? "Anggota" : "Members",
      icon: Users,
      show: permissions.canManageMembers,
    },
    {
      href: `${base}/settings`,
      label: id ? "Pengaturan" : "Settings",
      icon: Settings,
      show: permissions.canManage,
    },
  ].filter((t) => t.show)

  return (
    <div className="space-y-4">
      {/* Store header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/pos" />} className="h-8 px-2">
              <ChevronLeft className="size-4" />
              <span className="sr-only">{id ? "Kembali" : "Back"}</span>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">{store.name}</h1>
              <Badge
                className={cn(
                  "text-3xs px-1.5 py-0",
                  store.isOpen
                    ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground hover:bg-muted"
                )}
              >
                {store.isOpen ? (id ? "Buka" : "Open") : (id ? "Tutup" : "Closed")}
              </Badge>
            </div>
            <p className="text-2xs text-muted-foreground">
              {id ? "Toko POS" : "POS Store"} · {store.currency}
            </p>
          </div>
        </div>
        {/* Customer ordering entry: shareable QR + link */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <QrCode className="size-4" />
            {id ? "Bagikan QR menu" : "Share menu QR"}
          </Button>
          <Button variant="ghost" size="sm" render={<Link href={`/order/${store.slug}`} target="_blank" />}>
            {id ? "Lihat menu pelanggan" : "Customer menu ↗"}
          </Button>
        </div>
      </div>

      <ShareOrderDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        slug={store.slug}
        storeName={store.name}
      />

      {/* Tab nav — shared with Quick Store so both screens stay identical. */}
      <TabNav
        items={tabs.filter((tab) => tab.show)}
        ariaLabel={id ? "Navigasi POS" : "POS navigation"}
        layoutId={`pos-tab-${store.id}`}
      />

      {/* Page content */}
      <div>{children}</div>
    </div>
  )
}
