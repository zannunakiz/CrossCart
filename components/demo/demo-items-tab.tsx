"use client"

/**
 * `/demo` → Demo Items: the whole sample catalog, read-only.
 *
 * All 50 rows are rendered at once (no paging, no server) on the same table
 * design the QuickStore items tab uses. Everything about a row — name,
 * description, price with its discount, availability and stock — is stacked in
 * the first cell, so a phone still shows one readable column, while Category and
 * Language join in from `sm` up where there is room for them.
 *
 * Rows cascade in on mount (a full step each would take far too long for 50 rows,
 * so the stagger is capped) and the cascade replays every time the tab is opened,
 * because the page mounts this subtree per tab.
 */
import { motion, useReducedMotion } from "framer-motion"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DemoItem } from "@/lib/demo/demo"
import { useTranslation } from "@/lib/i18n"
import { discountedUnitCents, formatCents, toCents } from "@/lib/quickstore/cashier"

/** Same curve as the landing page's mockup, so the demo feels like one product. */
const ROW_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface Props {
  items: readonly DemoItem[]
}

export function DemoItemsTab({ items }: Props) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()

  const entrance = (index: number) => ({
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: shouldReduceMotion ? 0.15 : 0.35,
      // Cascade the head of the list, then let the tail arrive together.
      delay: Math.min(index * 0.012, 0.4),
      ease: ROW_EASE,
    },
  })

  const indonesian = items.filter((item) => item.origin === "ID").length

  return (
    <div className="space-y-3">
      {/* What this table is: every sample product, both catalogues, no editing. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-2xs text-muted-foreground">
          {t("{count} items", { count: items.length })}
          {" · "}
          {t("Demo only — nothing is saved to a database.")}
        </p>
        <p className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-3xs">
            ID {indonesian}
          </Badge>
          <Badge variant="outline" className="text-3xs">
            EN {items.length - indonesian}
          </Badge>
          <Badge variant="secondary" className="text-3xs">
            {t("Read-only")}
          </Badge>
        </p>
      </div>

      <motion.div
        {...entrance(0)}
        className="overflow-hidden rounded-lg border border-border bg-card"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-full min-w-[10rem]">{t("Items")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("Category")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("Language")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((item, index) => {
              const priceCents = toCents(item.price)
              // A discounted row prints its old price struck through, followed by
              // what the customer actually pays — exactly like the items tab.
              const discountedCents =
                item.discountPercent > 0
                  ? discountedUnitCents(priceCents, item.discountPercent)
                  : null

              return (
                <motion.tr
                  key={item.id}
                  id={`demo-item-${item.id}`}
                  {...entrance(index + 1)}
                  className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                >
                  <TableCell className="w-full whitespace-normal">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.name}</p>
                      {item.description ? (
                        <p className="line-clamp-2 text-2xs text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}

                      <p className="mt-1 flex flex-wrap items-baseline gap-1.5 tabular-nums">
                        {discountedCents === null ? (
                          <span className="text-sm font-semibold text-primary">
                            {formatCents(priceCents)}
                          </span>
                        ) : (
                          <>
                            <span className="text-2xs text-muted-foreground line-through">
                              {formatCents(priceCents)}
                            </span>
                            <span className="text-sm font-semibold text-primary">
                              {formatCents(discountedCents)}
                            </span>
                            <Badge variant="secondary" className="text-3xs">
                              -{item.discountPercent}%
                            </Badge>
                          </>
                        )}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={item.available ? "default" : "secondary"}
                          className="text-3xs"
                        >
                          {item.available ? t("Available") : t("Unavailable")}
                        </Badge>
                        <span className="text-2xs text-muted-foreground">
                          {item.stocks != null
                            ? t("{count} in stock", { count: item.stocks })
                            : t("Unlimited stock")}
                        </span>
                        {/* On a phone the two columns that had to go ride along as
                            one quiet line instead of being lost. */}
                        <span className="text-2xs text-muted-foreground sm:hidden">
                          {" · "}
                          {item.category} · {item.origin}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="text-3xs">
                      {item.category}
                    </Badge>
                  </TableCell>

                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="text-3xs">
                      {item.origin}
                    </Badge>
                  </TableCell>
                </motion.tr>
              )
            })}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  )
}
