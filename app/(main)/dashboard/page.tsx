import Link from "next/link"
import {
  ArrowUpRight,
  DollarSign,
  Package2,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react"

import { T } from "@/components/t"
import type { TranslationKey } from "@/lib/i18n"

export const metadata = {
  title: "Dashboard — CrossCart",
  description: "Overview of your CrossCart store operations.",
}

export default function DashboardPage() {
  const stats: {
    titleKey: TranslationKey
    value?: string
    valueKey?: TranslationKey
    changeKey: TranslationKey
    icon: React.ComponentType<{ className?: string }>
  }[] = [
    {
      titleKey: "dash.stats.grossSales",
      value: "Rp 3.420.000",
      changeKey: "dash.stats.grossSalesChange",
      icon: DollarSign,
    },
    {
      titleKey: "dash.stats.activeOrders",
      valueKey: "dash.stats.activeOrdersValue",
      changeKey: "dash.stats.activeOrdersChange",
      icon: ShoppingBag,
    },
    {
      titleKey: "dash.stats.lowStock",
      valueKey: "dash.stats.lowStockValue",
      changeKey: "dash.stats.lowStockChange",
      icon: Package2,
    },
    {
      titleKey: "dash.stats.staff",
      valueKey: "dash.stats.staffValue",
      changeKey: "dash.stats.staffChange",
      icon: Users,
    },
  ]

  const recentOrders: {
    id: string
    table: string
    items: string
    total: string
    statusKey: TranslationKey
  }[] = [
    { id: "#ORD-1049", table: "Table 04", items: "2x Latte, 1x Croissant", total: "Rp 95.000", statusKey: "dash.status.preparing" },
    { id: "#ORD-1048", table: "Takeaway", items: "1x Americano Ice", total: "Rp 32.000", statusKey: "dash.status.ready" },
    { id: "#ORD-1047", table: "Table 09", items: "3x Matcha, 2x Muffin", total: "Rp 160.000", statusKey: "dash.status.completed" },
  ]

  /** Two primary navigation destinations */
  const primaryNav: {
    titleKey: TranslationKey
    subtitleKey: TranslationKey
    href: string
    icon: React.ComponentType<{ className?: string }>
    badgeKey?: TranslationKey
  }[] = [
    {
      titleKey: "dash.app.pos.title",
      subtitleKey: "dash.app.pos.subtitle",
      href: "/pos",
      icon: ShoppingCart,
      badgeKey: "dash.badge.live",
    },
    {
      titleKey: "dash.app.quickstore.title",
      subtitleKey: "dash.app.quickstore.subtitle",
      href: "/quickstore",
      icon: Store,
    },
  ]

  const shortcuts: {
    titleKey: TranslationKey
    href: string
    icon: React.ComponentType<{ className?: string }>
  }[] = [
    { titleKey: "dash.app.pos.title", href: "/pos", icon: ShoppingBag },
    { titleKey: "dash.app.quickstore.title", href: "/quickstore", icon: Store },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <T k="dash.title" />
          </h1>
          <p className="text-sm text-muted-foreground">
            <T k="dash.subtitle" />
          </p>
        </div>
      </div>

      {/* ── Primary navigation cards ──────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {primaryNav.map((nav) => {
          const Icon = nav.icon
          return (
            <Link
              key={nav.href}
              href={nav.href}
              className="group relative flex items-center gap-4 border border-border bg-card p-5 transition-colors hover:border-foreground"
            >
              <span className="grid size-12 shrink-0 place-items-center border border-border bg-background transition-transform group-hover:scale-105">
                <Icon className="size-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    <T k={nav.titleKey} />
                  </span>
                  {nav.badgeKey && (
                    <span className="bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-primary uppercase">
                      <T k={nav.badgeKey} />
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  <T k={nav.subtitleKey} />
                </p>
              </div>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          )
        })}
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.titleKey}
              className="border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  <T k={stat.titleKey} />
                </span>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-4">
                <div className="text-2xl font-medium tracking-tight text-foreground">
                  {stat.valueKey ? <T k={stat.valueKey} /> : stat.value}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  <T k={stat.changeKey} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent Orders & Quick Links */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h3 className="text-base font-semibold">
                <T k="dash.recentOrders" />
              </h3>
              <p className="text-xs text-muted-foreground">
                <T k="dash.recentOrdersSub" />
              </p>
            </div>
            <Link
              href="/pos"
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              <T k="dash.app.pos.title" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-3 font-medium">
                    <T k="dash.col.orderId" />
                  </th>
                  <th className="pb-3 font-medium">
                    <T k="dash.col.type" />
                  </th>
                  <th className="pb-3 font-medium">
                    <T k="dash.col.items" />
                  </th>
                  <th className="pb-3 font-medium">
                    <T k="dash.col.total" />
                  </th>
                  <th className="pb-3 font-medium">
                    <T k="dash.col.status" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-mono font-medium text-foreground">{order.id}</td>
                    <td className="py-3 text-muted-foreground">{order.table}</td>
                    <td className="py-3 text-foreground font-medium">{order.items}</td>
                    <td className="py-3 font-semibold text-foreground">{order.total}</td>
                    <td className="py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          order.statusKey === "dash.status.preparing"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : order.statusKey === "dash.status.ready"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        <T k={order.statusKey} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Shortcuts */}
        <div className="space-y-4 border border-border bg-card p-5">
          <h3 className="text-base font-semibold">
            <T k="dash.shortcuts" />
          </h3>
          <p className="text-xs text-muted-foreground">
            <T k="dash.shortcutsSub" />
          </p>

          <div className="space-y-2 pt-2">
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon
              return (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="group flex items-center justify-between border-b border-border/50 py-3 last:border-0 transition-colors hover:border-foreground cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-7 place-items-center border border-border bg-background text-muted-foreground group-hover:text-primary transition-colors">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      <T k={shortcut.titleKey} />
                    </span>
                  </div>
                  <ArrowUpRight className="size-3.5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
