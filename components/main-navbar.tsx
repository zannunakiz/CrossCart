"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Menu, Moon, Store, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"

import { useMainSidebar } from "@/components/main-sidebar-context"
import { UserAvatar } from "@/components/user-avatar"
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  subscribePreferences,
  toggleTheme,
} from "@/lib/preferences"

const routeTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/pos": "Point of Sale",
  "/dashboard/kitchen": "Kitchen Display",
  "/dashboard/inventory": "Inventory & Stock",
  "/dashboard/orders": "Orders & Sales",
  "/dashboard/payments": "Payment Methods",
  "/dashboard/customers": "Customers",
  "/dashboard/analytics": "Analytics & Reports",
  "/dashboard/settings": "Store Settings",
}

export function MainNavbar() {
  const { toggle } = useMainSidebar()
  const pathname = usePathname()
  const { data: session } = useSession()

  const isDark = useSyncExternalStore(
    subscribePreferences,
    getThemeSnapshot,
    getServerThemeSnapshot
  )

  const currentTitle = routeTitles[pathname] ?? "Dashboard"

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      {/* Left: Sidebar Toggle Button & Current Page Title */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle navigation sidebar"
          className="grid size-9 place-items-center border border-border bg-background text-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-ring"
        >
          <Menu className="size-4" />
        </button>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground sm:hidden cursor-pointer"
          >
            <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
              <Store className="size-3" />
            </div>
            <span>crosscart</span>
          </Link>

          <span className="hidden text-xs text-muted-foreground sm:inline-block">/</span>
          <h1 className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline-block">
            {currentTitle}
          </h1>
        </div>
      </div>

      {/* Right: Quick actions, Theme Toggle, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="grid size-8 place-items-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </button>

        {/* User avatar indicator */}
        <div className="flex items-center gap-2.5 pl-1 sm:pl-2">
          <UserAvatar
            src={session?.user?.image}
            name={session?.user?.name ?? session?.user?.email ?? "User"}
            className="size-8 ring-1 ring-border"
          />
          <div className="hidden flex-col leading-none md:flex">
            <span className="text-xs font-semibold text-foreground">
              {session?.user?.name ?? "Operator"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {session?.user?.email ?? "Online"}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
