"use client"

import { useState } from "react"
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  MAX_QTY_PER_LINE,
  availabilityLabel,
  checkAvailability,
  clampQuantity,
  formatCents,
  parseQuantity,
  type CashierItem,
  type SaleLine,
} from "@/lib/quickstore/cashier"
import { availabilityMessage, availabilityText, useTranslation } from "@/lib/i18n"

interface Props {
  lines: readonly SaleLine[]
  catalog: readonly CashierItem[]
  onQuantityChange: (item: CashierItem, quantity: number) => void
  onRemove: (itemId: string) => void
  onClear: () => void
  disabled?: boolean
  /** Rendered inside the empty state (e.g. a hint pointing at the search box). */
  emptyHint?: React.ReactNode
}

/**
 * The running sale: every line with a quantity stepper, per-line warnings for
 * unavailable / under-stocked products and the line total.
 */
export function SaleCart({
  lines,
  catalog,
  onQuantityChange,
  onRemove,
  onClear,
  disabled = false,
  emptyHint,
}: Props) {
  const { lang, t } = useTranslation()
  // Free-text drafts so a half-typed value ("") is not silently coerced.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const clearDraft = (itemId: string) =>
    setDrafts((prev) => {
      if (!(itemId in prev)) return prev
      const next = { ...prev }
      delete next[itemId]
      return next
    })

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card px-6 py-14 text-center">
        <span className="mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <ShoppingCart className="size-6" />
        </span>
        <p className="font-semibold">{t("Cart is empty")}</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {emptyHint ?? t("Search for a product above to start the sale.")}
        </p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t(itemCount === 1 ? "{count} item" : "{count} items", { count: itemCount })} ·{" "}
          {t(lines.length === 1 ? "{count} line" : "{count} lines", { count: lines.length })}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={onClear}
          disabled={disabled}
        >
          <Trash2 className="size-3.5" />
          {t("Clear")}
        </Button>
      </div>

      <ul className="divide-y divide-border">
        {lines.map((line) => {
          const item = catalog.find((candidate) => candidate.id === line.itemId)
          const availability = item
            ? checkAvailability(item, line.quantity)
            : {
                ok: false,
                code: "unavailable" as const,
                message: "Product no longer exists",
                orderable: 0,
              }

          const draft = drafts[line.itemId]
          const draftInvalid = draft !== undefined && parseQuantity(draft) === null
          const capped = item ? clampQuantity(line.quantity + 1, item) === line.quantity : false

          return (
            <li key={line.itemId} className="px-4 py-3" data-testid={`cart-line-${line.name}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    {line.discountPercent > 0 && (
                      <Badge variant="secondary" className="shrink-0 text-3xs">
                        -{line.discountPercent}%
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {t("{price} each", {
                      price: formatCents(line.unitPricePaidCents, line.currency),
                    })}
                    {line.discountPercent > 0 && (
                      <span className="ml-1 line-through opacity-60">
                        {formatCents(line.unitPriceCents, line.currency)}
                      </span>
                    )}
                    {line.stocks != null && ` · ${t("{count} in stock", { count: line.stocks })}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("Decrease quantity of {name}", { name: line.name })}
                      disabled={disabled}
                      onClick={() => {
                        clearDraft(line.itemId)
                        if (item) onQuantityChange(item, line.quantity - 1)
                        else onRemove(line.itemId)
                      }}
                    >
                      <Minus className="size-3.5" />
                    </Button>

                    <Input
                      aria-label={t("Quantity of {name}", { name: line.name })}
                      inputMode="numeric"
                      className="h-7 w-14 text-center tabular-nums"
                      value={draft ?? String(line.quantity)}
                      aria-invalid={draftInvalid}
                      disabled={disabled}
                      onChange={(event) => {
                        const raw = event.target.value
                        const parsed = parseQuantity(raw)
                        setDrafts((prev) => ({ ...prev, [line.itemId]: raw }))
                        if (parsed !== null && item) onQuantityChange(item, parsed)
                      }}
                      onBlur={() => clearDraft(line.itemId)}
                    />

                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("Increase quantity of {name}", { name: line.name })}
                      disabled={disabled || capped || !availability.ok}
                      onClick={() => {
                        clearDraft(line.itemId)
                        if (item) onQuantityChange(item, line.quantity + 1)
                      }}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <span
                    className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums"
                    data-testid={`line-total-${line.name}`}
                  >
                    {formatCents(line.lineTotalCents, line.currency)}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("Remove {name} from the sale", { name: line.name })}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    onClick={() => onRemove(line.itemId)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {(!availability.ok || draftInvalid) && (
                <p className="mt-2 text-2xs font-medium text-destructive">
                  {draftInvalid
                    ? t("Quantity must be a whole number of at least 1")
                    : availabilityMessage(lang, availability.code, availability.message, {
                        name: line.name,
                        stocks: line.stocks ?? 0,
                        max: MAX_QTY_PER_LINE,
                      }) ||
                      availabilityText(
                        lang,
                        availability.code,
                        availabilityLabel(availability.code)
                      )}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
