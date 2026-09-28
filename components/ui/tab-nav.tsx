"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export type TabNavItem = {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  /** Route target — the tab renders as a link and is active on that path. */
  href?: string
  /** Identity of a state-based tab, compared against `activeValue`. */
  value?: string
}

/**
 * Underlined tab strip shared by the Quick Store screens.
 *
 * Keeping the markup in one place is what makes every screen identical: same
 * paddings, icon size, hover colour and spring-animated underline.
 * `href` tabs navigate, `value` tabs call `onSelect`.
 */
export function TabNav({
  items,
  activeValue,
  onSelect,
  ariaLabel,
  layoutId,
  className,
}: {
  items: TabNavItem[]
  /** Active value for state-based tabs; link tabs use the current pathname. */
  activeValue?: string
  onSelect?: (value: string) => void
  ariaLabel: string
  /** Shared layout id for the animated underline — keep it unique per nav. */
  layoutId: string
  className?: string
}) {
  const pathname = usePathname()

  return (
    <div className="relative">
      <nav
        className={cn("flex gap-1 overflow-x-auto border-b pb-0 scrollbar-none", className)}
        aria-label={ariaLabel}
      >
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.href
            ? pathname === item.href || pathname.startsWith(item.href + "/")
            : item.value !== undefined && item.value === activeValue

          const content = (
            <>
              {Icon && <Icon className="size-3.5 shrink-0" />}
              {item.label}
              {isActive && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
            </>
          )

          const itemClassName = cn(
            "relative flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors",
            isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )

          if (item.href) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={itemClassName}
              >
                {content}
              </Link>
            )
          }

          return (
            <button
              key={item.value}
              type="button"
              onClick={() => item.value !== undefined && onSelect?.(item.value)}
              aria-current={isActive ? "true" : undefined}
              className={itemClassName}
            >
              {content}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
