import Link from "next/link"
import {
  ArrowUpRight,
  BarChart3,
  ChefHat,
  DollarSign,
  Package2,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react"

export const metadata = {
  title: "Dashboard — CrossCart",
  description: "Overview of your CrossCart store operations.",
}

export default function DashboardPage() {
  const stats = [
    {
      title: "Today's Gross Sales",
      value: "Rp 3.420.000",
      change: "+12.5% vs yesterday",
      icon: DollarSign,
    },
    {
      title: "Active Orders",
      value: "18 Orders",
      change: "4 waiting in kitchen",
      icon: ShoppingBag,
    },
    {
      title: "Low Stock Items",
      value: "3 items",
      change: "Oat Milk, Vanilla, Cups",
      icon: Package2,
    },
    {
      title: "Staff on Duty",
      value: "5 Members",
      change: "Shift ends 16:00",
      icon: Users,
    },
  ]

  const recentOrders = [
    { id: "#ORD-1049", table: "Table 04", items: "2x Latte, 1x Croissant", total: "Rp 95.000", status: "Preparing" },
    { id: "#ORD-1048", table: "Takeaway", items: "1x Americano Ice", total: "Rp 32.000", status: "Ready" },
    { id: "#ORD-1047", table: "Table 09", items: "3x Matcha, 2x Muffin", total: "Rp 160.000", status: "Completed" },
  ]

  /** Two primary navigation destinations */
  const primaryNav = [
    {
      title: "POS System",
      subtitle: "Point-of-sale cashier for in-store orders",
      href: "/pos",
      icon: ShoppingCart,
      badge: "Live",
    },
    {
      title: "Quick Store",
      subtitle: "Manage your online micro-store & inventory",
      href: "/quickstore",
      icon: Store,
      badge: null,
    },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live overview of store sales, orders, and kitchen operations.
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
                  <span className="font-medium text-foreground">{nav.title}</span>
                  {nav.badge && (
                    <span className="bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-primary uppercase">
                      {nav.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{nav.subtitle}</p>
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
              key={stat.title}
              className="border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] uppercase tracking-wider font-semibold">{stat.title}</span>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-4">
                <div className="text-2xl font-medium tracking-tight text-foreground">
                  {stat.value}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">{stat.change}</div>
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
              <h3 className="text-base font-semibold">Recent Store Orders</h3>
              <p className="text-xs text-muted-foreground">Real-time receipts from tables &amp; counter</p>
            </div>
            <Link
              href="/dashboard/orders"
              className="text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              View all
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-3 font-medium">Order ID</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Items</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
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
                          order.status === "Preparing"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : order.status === "Ready"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {order.status}
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
          <h3 className="text-base font-semibold">Quick Shortcuts</h3>
          <p className="text-xs text-muted-foreground">Fast navigation</p>

          <div className="space-y-2 pt-2">
            {[
              { title: "Point of Sale (POS)", href: "/pos", icon: ShoppingBag },
              { title: "Quick Store", href: "/quickstore", icon: Store },
              { title: "Kitchen Display (KDS)", href: "/dashboard/kitchen", icon: ChefHat },
              { title: "Inventory Stocks", href: "/dashboard/inventory", icon: Package2 },
              { title: "Sales Analytics", href: "/dashboard/analytics", icon: BarChart3 },
            ].map((shortcut) => {
              const Icon = shortcut.icon
              return (
                <Link
                  key={shortcut.title}
                  href={shortcut.href}
                  className="group flex items-center justify-between border-b border-border/50 py-3 last:border-0 transition-colors hover:border-foreground cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-7 place-items-center border border-border bg-background text-muted-foreground group-hover:text-primary transition-colors">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      {shortcut.title}
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
