"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import {
  ChevronRight,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  LogOut,
  Moon,
  ShoppingCart,
  Store,
  Sun,
  X,
} from "lucide-react"

import { useEffect, useSyncExternalStore } from "react"

import { useMainSidebar } from "@/components/main-sidebar-context"
import { STORE_TAB_UI } from "@/components/quickstore/store-tab-ui"
import { useQuickStoreHeader } from "@/components/quickstore/store-header-context"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { UserAvatar } from "@/components/user-avatar"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
import { canCreateSale } from "@/lib/quickstore/permissions"
import { allowedStoreTabs, storeTabUrlParams } from "@/lib/quickstore/store-tabs"
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  subscribePreferences,
  toggleLanguage,
  toggleTheme,
} from "@/lib/preferences"
import { cn } from "@/lib/utils"

export interface NavItem {
  titleKey: TranslationKey
  href: string
  icon: React.ComponentType<{ className?: string }>
  badgeKey?: TranslationKey
}

export interface NavGroup {
  labelKey: TranslationKey
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    labelKey: "nav.group.apps",
    items: [
      { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
      { titleKey: "nav.quickstore", href: "/quickstore", icon: Store },
    ],
  },
]

export function MainSidebar() {
  const { open, setOpen } = useMainSidebar()
  const { header } = useQuickStoreHeader()
  const pathname = usePathname()
  const { data: session } = useSession()
  const { lang, t } = useTranslation()

  /**
   * Store block. The store pages publish the store they are showing through
   * `useQuickStoreHeader` (name, open state, role, open tab), so the drawer can
   * add its data — the tab list and the cashier shortcut — on `/quickstore/[storeId]`
   * (and its child routes) without a second fetch of its own. Elsewhere the
   * header is `null` and the drawer stays exactly as it was.
   */
  const storeTabs = header ? allowedStoreTabs(header.role) : []
  const cashierHref = header ? `/quickstore/${header.storeId}/cashier` : ""

  const isDark = useSyncExternalStore(
    subscribePreferences,
    getThemeSnapshot,
    getServerThemeSnapshot
  )

  // Close the drawer with the Escape key for keyboard users.
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, setOpen])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={t("nav.closeSidebar")}
        onClick={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen(false)
        }}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ease-in-out cursor-pointer",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        aria-label={t("nav.sidebarNav")}
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 sm:w-80 flex-col border-r border-border bg-background transition-transform duration-300 ease-in-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 font-bold tracking-tight text-foreground cursor-pointer group"
          >
            <div className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground">
              <Store className="size-4" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-semibold">
                crosscart<span className="text-primary">.</span>
              </span>
              <span className="font-mono text-3xs uppercase tracking-wider text-muted-foreground mt-0.5">
                {t("brand.adminConsole")}
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("nav.closeSidebar")}
            className="grid size-8 place-items-center rounded border border-border bg-background text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav aria-label={t("nav.sidebarNav")} className="flex-1 space-y-6 overflow-y-auto p-4">
          {navGroups.map((group) => (
            <div key={group.labelKey} className="space-y-1">
              <p className="px-3 text-3xs font-bold tracking-[0.16em] uppercase text-muted-foreground/80">
                {t(group.labelKey)}
              </p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href))

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer",
                        isActive
                          ? "bg-muted text-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon
                          className={cn(
                            "size-4 shrink-0 transition-colors",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        <span className="truncate">{t(item.titleKey)}</span>
                      </div>

                      {item.badgeKey ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-3xs font-semibold leading-none",
                            isActive
                              ? "bg-foreground text-background"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {t(item.badgeKey)}
                        </span>
                      ) : (
                        <ChevronRight
                          className={cn(
                            "size-3.5 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5",
                            isActive && "opacity-80"
                          )}
                        />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}

          {/* QuickStore detail routes add their data here: the store, its four
              tabs (active one in the primary color) and the cashier shortcut. */}
          {header && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="space-y-1">
                <p className="px-3 text-3xs font-bold tracking-[0.16em] uppercase text-muted-foreground/80">
                  {t("nav.group.store")}
                </p>

                <div className="mt-2 flex items-center gap-2.5 rounded-md bg-muted/50 px-3 py-2.5">
                  <Store className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {header.name}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      <span
                        className={cn(
                          "font-medium",
                          header.open
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {header.open ? t("Open") : t("Closed")}
                      </span>
                      {" • "}
                      <span className="font-medium text-foreground">
                        {header.role.toLowerCase()}
                      </span>
                    </p>
                  </div>
                </div>

                {/* The one loud action of the drawer: ring up a sale. Opens in its
                    own tab, so the store screen (and the open tab) stays put. */}
                {canCreateSale(header.role) && (
                  <Link
                    href={cashierHref}
                    id="sidebar-open-cashier-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("nav.openCashierNewTab")}
                    title={t("nav.openCashierNewTab")}
                    onClick={() => setOpen(false)}
                    className="mt-2 block"
                  >
                    <Button size="lg" className="w-full gap-2 font-semibold">
                      <ShoppingCart className="size-3.5" />
                      <span>{t("To Cashier")}</span>
                      <ExternalLink className="size-3" />
                    </Button>
                  </Link>
                )}
              </div>

              {storeTabs.length > 0 && (
                <div className="space-y-1">
                  <p className="px-3 text-3xs font-bold tracking-[0.16em] uppercase text-muted-foreground/80">
                    {t("nav.group.storeTabs")}
                  </p>

                  <div className="mt-2 space-y-1">
                    {storeTabs.map((value) => {
                      const { titleKey, icon: Icon } = STORE_TAB_UI[value]
                      const isActive = value === header.tab

                      return (
                        <Link
                          key={value}
                          href={`/quickstore/${header.storeId}?${storeTabUrlParams(
                            new URLSearchParams(),
                            value
                          ).toString()}`}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "group flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer",
                            isActive
                              ? "border-primary bg-primary/10 font-semibold text-primary"
                              : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="truncate">{t(titleKey)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="border-t border-border p-4 bg-muted/20">
          <div className="flex items-center gap-3 mb-3">
            <UserAvatar
              src={session?.user?.image}
              name={session?.user?.name ?? session?.user?.email ?? "User"}
              className="size-9 ring-1 ring-border"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {session?.user?.name ?? "Operator"}
              </p>
              <p className="truncate text-2xs text-muted-foreground">
                {session?.user?.email ?? "operator@crosscart.com"}
              </p>
            </div>
          </div>

          <Separator className="my-2 opacity-50" />

          {/* Theme + language switches */}
          <div className="mb-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t("nav.toggleTheme")}
              className="flex items-center justify-center gap-2 border border-border bg-background px-2 py-2 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              <span>{isDark ? t("nav.theme.dark") : t("nav.theme.light")}</span>
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={t("nav.toggleLanguage")}
              className="flex items-center justify-center gap-2 border border-border bg-background px-2 py-2 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <Globe2 className="size-3.5" />
              <span>{lang === "ID" ? "ID" : "EN"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 cursor-pointer"
          >
            <LogOut className="size-4 shrink-0" />
            <span>{t("nav.signOut")}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
