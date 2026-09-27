"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import {
  ChefHat,
  ChevronLeft,
  ClipboardList,
  History,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  const pathname = usePathname()
  const lang = useLanguage()
  const id = lang === "ID"
  const base = `/pos/${store.id}`

  const tabs = [
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
                  "text-[10px] px-1.5 py-0",
                  store.isOpen
                    ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground hover:bg-muted"
                )}
              >
                {store.isOpen ? (id ? "Buka" : "Open") : (id ? "Tutup" : "Closed")}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {id ? "Toko POS" : "POS Store"} · {store.currency}
            </p>
          </div>
        </div>
        {/* QR link for customer view */}
        <Button variant="outline" size="sm" render={<Link href={`/order/${store.slug}`} target="_blank" />}>
            {id ? "Lihat menu pelanggan" : "Customer menu ↗"}
        </Button>
      </div>

      {/* Tab nav */}
      <div className="relative">
        <nav
          className="flex gap-1 overflow-x-auto border-b pb-0 scrollbar-none"
          aria-label={id ? "Navigasi POS" : "POS navigation"}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/")
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                {tab.label}
                {isActive && (
                  <motion.span
                    layoutId={`pos-tab-${store.id}`}
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Page content */}
      <div>{children}</div>
    </div>
  )
}
