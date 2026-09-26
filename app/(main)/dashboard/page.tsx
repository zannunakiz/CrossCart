import Link from "next/link"
import {
  ArrowUpRight,
  BarChart3,
  ChefHat,
  DollarSign,
  Package2,
  ShoppingBag,
  Users,
} from "lucide-react"

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

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Overview Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Live overview of store sales, orders, and kitchen operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/pos"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 cursor-pointer"
          >
            <ShoppingBag className="size-4" />
            Open Cashier POS
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.title}
              className="rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">{stat.title}</span>
                <span className="rounded-md bg-secondary p-2 text-foreground">
                  <Icon className="size-4 text-primary" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.change}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent Orders & Quick Links */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h3 className="text-base font-semibold">Recent Store Orders</h3>
              <p className="text-xs text-muted-foreground">Real-time receipts from tables & counter</p>
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
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold">Quick Shortcuts</h3>
          <p className="text-xs text-muted-foreground">Fast navigation</p>

          <div className="space-y-2 pt-2">
            {[
              { title: "Point of Sale (POS)", href: "/dashboard/pos", icon: ShoppingBag },
              { title: "Kitchen Display (KDS)", href: "/dashboard/kitchen", icon: ChefHat },
              { title: "Inventory Stocks", href: "/dashboard/inventory", icon: Package2 },
              { title: "Sales Analytics", href: "/dashboard/analytics", icon: BarChart3 },
            ].map((shortcut) => {
              const Icon = shortcut.icon
              return (
                <Link
                  key={shortcut.title}
                  href={shortcut.href}
                  className="group flex items-center justify-between rounded-lg border border-border/80 p-3 transition-colors hover:border-primary hover:bg-muted/40 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-md bg-secondary text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-xs font-semibold text-foreground group-hover:text-primary">
                      {shortcut.title}
                    </span>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
