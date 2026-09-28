"use client"

import type { StoreRole } from "@/lib/db/schema"
import { useTranslation } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Store state that used to live in the navbar: the open/closed state and the
 * signed-in user's role. Rendered in the page content as plain text —
 * `STATUS: open • ROLE: admin` — identically on the store detail page and on the
 * cashier route (open is green, closed is red), so both screens read the same
 * and the navbar only carries the breadcrumb.
 */
export function StoreStatusLine({
  open,
  role,
  className,
}: {
  open: boolean
  role: StoreRole
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted-foreground", className)}>
      <div>
        {t("STATUS:")}{" "}
        <span
          className={cn(
            "font-medium",
            open
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          )}
        >
          {open ? t("open") : t("closed")}
        </span>
      </div>
      <span>•</span>
      <div>
        {t("ROLE:")} <span className="font-medium text-foreground">{role.toLowerCase()}</span>
      </div>
    </div>
  )
}
