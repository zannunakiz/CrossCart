"use client"

import { Globe2, Menu, Moon, Sun } from "lucide-react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"

import { useMainSidebar } from "@/components/main-sidebar-context"
import { useQuickStoreHeader } from "@/components/quickstore/store-header-context"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { UserAvatar } from "@/components/user-avatar"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
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

/**
 * Section roots that are rendered as a single-crumb breadcrumb in the navbar
 * (same component/style as `quickstore › {store}`), showing only the section
 * label — `/pos` → "POS System" and `/quickstore` → "Quick Store".
 */
const sectionBreadcrumbs: { prefix: string; titleKey: TranslationKey }[] = [
  { prefix: "/pos", titleKey: "nav.pos" },
  { prefix: "/quickstore", titleKey: "nav.quickstore" },
]

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
   * Breadcrumb for the store routes: `Quick Store › {store name}` — desktop
   * only. On mobile the navbar hides the store name and the page prints it
   * above the cashier / status row instead (see the store pages). The
   * open/closed badge, role badge and cashier shortcut live in the page content
   * (see `StoreStatusBar`), not in the navbar.
   */
  const storeHeader = pathname.startsWith("/quickstore/") ? header : null

  /**
   * `/pos`, `/quickstore` and their child routes (that do not publish a store
   * header) fall back to a one-item breadcrumb with the section label.
   */
  const section = sectionBreadcrumbs.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

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
          {storeHeader ? (
            /* `sm:` and up only — mobile shows the store name in the page body. */
            <Breadcrumb className="hidden min-w-0 sm:block">
              <BreadcrumbList>
                {/* The brand logo already links out on mobile, so the crumb is desktop-only. */}
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink render={<Link href="/quickstore" />} className="cursor-pointer">
                    {t("nav.quickstore")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:list-item" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate font-semibold">
                    {storeHeader.name}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : section ? (
            <Breadcrumb className="min-w-0">
              <BreadcrumbList>
                {/* Same breadcrumb as the store routes, but only the section label. */}
                <BreadcrumbItem className="hidden sm:inline-flex">
                  {pathname === section.prefix ? (
                    <BreadcrumbPage className="font-semibold">
                      {t(section.titleKey)}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      render={<Link href={section.prefix} />}
                      className="cursor-pointer"
                    >
                      {t(section.titleKey)}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline-block">/</span>
              <h1 className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline-block">
                {t(currentTitleKey ?? "nav.dashboard")}
              </h1>
            </>
          )}
        </div>
      </div>

      {/* Right: Language & Theme Toggles, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
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