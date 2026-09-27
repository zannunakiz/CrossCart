"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { Globe2, Menu, Moon, ShoppingCart, Store, Sun, ToggleLeft, ToggleRight } from "lucide-react"
import { useSyncExternalStore } from "react"

import { useMainSidebar } from "@/components/main-sidebar-context"
import { useQuickStoreHeader } from "@/components/quickstore/store-header-context"
import { UserAvatar } from "@/components/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
import { hasPermission } from "@/lib/quickstore/permissions"
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  subscribePreferences,
  toggleLanguage,
  toggleTheme,
} from "@/lib/preferences"

const routeTitleKeys: Record<string, TranslationKey> = {
  "/dashboard": "nav.dashboard",
  "/pos": "nav.pos",
  "/quickstore": "nav.quickstore",
}

export function MainNavbar() {
  const { toggle } = useMainSidebar()
  const pathname = usePathname()
  const { data: session } = useSession()
  const { lang, t } = useTranslation()
  const { header } = useQuickStoreHeader()

  const isDark = useSyncExternalStore(
    subscribePreferences,
    getThemeSnapshot,
    getServerThemeSnapshot
  )

  const currentTitleKey = routeTitleKeys[pathname]

  /**
   * Inside a QuickStore store the breadcrumb replaces the page title, so the
   * same `quickstore › {store} {open/closed} {role}` line shows on every child
   * route (store detail, cashier, …).
   */
  const storeHeader = pathname.startsWith("/quickstore/") ? header : null
  const cashierHref = storeHeader ? `/quickstore/${storeHeader.storeId}/cashier` : null
  const showCashierAction =
    !!cashierHref &&
    pathname !== cashierHref &&
    hasPermission(storeHeader?.role, "sale:create")

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
      {/* Left: Sidebar Toggle Button & Breadcrumb / Current Page Title */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={t("nav.toggleSidebar")}
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

          {storeHeader ? (
            <Breadcrumb className="min-w-0">
              <BreadcrumbList>
                {/* The brand logo already links out on mobile, so the crumb is desktop-only. */}
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink render={<Link href="/quickstore" />} className="cursor-pointer">
                    {t("nav.quickstore")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:list-item" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{storeHeader.name}</span>
                    <Badge
                      variant={storeHeader.open ? "default" : "secondary"}
                      className="gap-1 text-3xs"
                    >
                      {storeHeader.open ? (
                        <ToggleRight className="size-3" />
                      ) : (
                        <ToggleLeft className="size-3" />
                      )}
                      {storeHeader.open ? t("Open") : t("Closed")}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-3xs font-semibold uppercase tracking-wide"
                    >
                      {storeHeader.role}
                    </Badge>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline-block">/</span>
              <h1 className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline-block">
                {currentTitleKey
                  ? t(currentTitleKey)
                  : pathname.startsWith("/dashboard")
                  ? t("nav.dashboard")
                  : pathname.startsWith("/pos")
                  ? t("nav.pos")
                  : t("nav.quickstore")}
              </h1>
            </>
          )}
        </div>
      </div>

      {/* Right: Quick actions, Language & Theme Toggles, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {showCashierAction && cashierHref && (
          <Link href={cashierHref} id="open-cashier-btn">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ShoppingCart className="size-3.5" />
              <span className="hidden sm:inline">{t("Cashier")}</span>
            </Button>
          </Link>
        )}

        {/* Language toggle (EN / ID) */}
        <button
          type="button"
          onClick={toggleLanguage}
          aria-label={t("nav.toggleLanguage")}
          className="flex h-8 items-center gap-1.5 border border-border bg-background px-2 text-2xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <Globe2 className="size-3.5" />
          <span className={lang === "EN" ? "text-foreground" : "opacity-60"}>EN</span>
          <span className="opacity-40">/</span>
          <span className={lang === "ID" ? "text-foreground" : "opacity-60"}>ID</span>
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t("nav.toggleTheme")}
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
            <span className="text-3xs text-muted-foreground">
              {session?.user?.email ?? "Online"}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
