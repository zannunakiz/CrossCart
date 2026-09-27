"use client"

import Link from "next/link"
import { ShoppingCart } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { StoreRole } from "@/lib/db/schema"
import { useTranslation } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { hasPermission } from "@/lib/quickstore/permissions"

/**
 * Store actions that used to live in the navbar breadcrumb: the cashier
 * shortcut, the open/closed state and the signed-in user's role. Rendered in
 * the page content (above the tab navigation) so the navbar only shows the
 * breadcrumb. Order: cashier button, open/closed badge, role badge.
 */
export function StoreStatusBar({
  storeId,
  open,
  role,
  showCashier = true,
  className,
}: {
  storeId: string
  open: boolean
  role: StoreRole
  /** Hidden on the cashier route itself (you are already there). */
  showCashier?: boolean
  className?: string
}) {
  const { t } = useTranslation()

  const showCashierAction = showCashier && hasPermission(role, "sale:create")

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {showCashierAction && (
        <Link href={`/quickstore/${storeId}/cashier`} id="open-cashier-btn">
          <Button size="sm" className="gap-1.5">
            <ShoppingCart className="size-3.5" />
            {t("Cashier")}
          </Button>
        </Link>
      )}

      <Badge
        variant={open ? "default" : "secondary"}
        className={`text-3xs ${!open ? "dark:bg-zinc-800 dark:border-zinc-800 dark:text-zinc-300" : ""}`}
      >
        {open ? t("Open") : t("Closed")}
      </Badge>

      <Badge variant="outline" className="text-3xs font-semibold uppercase tracking-wide">
        {role}
      </Badge>
    </div>
  )
}
