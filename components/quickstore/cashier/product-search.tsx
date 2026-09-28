"use client"

import { useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete"
import { Badge } from "@/components/ui/badge"
import { availabilityText, useTranslation } from "@/lib/i18n"
import {
  MAX_SUGGESTIONS,
  availabilityLabel,
  checkAvailability,
  discountedUnitCents,
  formatCents,
  rankItems,
  toCents,
  type CashierItem,
} from "@/lib/quickstore/cashier"

interface Props {
  items: readonly CashierItem[]
  /** Called when the cashier picks a sellable suggestion. */
  onSelect: (item: CashierItem) => void
  disabled?: boolean
}

/**
 * Product autocomplete for the cashier.
 *
 * Suggestions are ranked client-side and hard-limited to `MAX_SUGGESTIONS`
 * (3) entries, so the popup stays small even in large catalogs. Products that
 * cannot be sold (unavailable / out of stock) are still listed — with the
 * reason — but cannot be selected. Each row is just name + payable price: no
 * image block, no description, no strike-through, no discount percentage.
 */
export function ProductSearch({ items, onSelect, disabled = false }: Props) {
  const { lang, t } = useTranslation()
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(
    () => rankItems(items, query, MAX_SUGGESTIONS),
    [items, query]
  )

  const handlePick = (item: CashierItem) => {
    const availability = checkAvailability(item, 1)
    if (!availability.ok) return
    onSelect(item)
    // Clear the box so the cashier can immediately scan the next product.
    setQuery("")
    inputRef.current?.focus()
  }

  return (
    <Autocomplete<CashierItem>
      items={suggestions}
      // We already rank + limit the list, so Base UI must not filter it again.
      filter={null}
      value={query}
      onValueChange={(value, details) => {
        // Base UI writes the picked label back into the input; the cashier
        // wants an empty box ready for the next product instead.
        if (details.reason === "item-press") return
        setQuery(value)
      }}
      // The popup only appears while the cashier is typing.
      open={query.trim().length > 0}
      disabled={disabled}
      itemToStringValue={(item) => item.name}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <AutocompleteInput
          ref={inputRef}
          id="product-search-input"
          aria-label={t("Search products")}
          placeholder={t("Type a product name…")}
          className="h-11 pl-9"
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      <AutocompleteContent>
        <AutocompleteEmpty>
          {query.trim() === ""
            ? t("Start typing to search products")
            : t('No product matches "{query}"', { query: query.trim() })}
        </AutocompleteEmpty>

        <AutocompleteList data-testid="product-suggestions">
          {(item: CashierItem, index: number) => {
            const availability = checkAvailability(item, 1)
            const sellable = availability.ok
            return (
              <AutocompleteItem
                key={item.id}
                index={index}
                value={item}
                data-testid={`product-suggestion-${item.name}`}
                disabled={!sellable}
                onClick={() => handlePick(item)}
                className="items-center gap-2 py-2.5"
              >
                {/* No leading image / avatar block — the row stays a compact
                    name → price line. */}
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    {/* One type step down from the rest of the screen: the popup
                        lists up to three products, and `text-xs` keeps all three
                        rows visible above the keyboard on a phone. */}
                    <span className="min-w-0 truncate text-xs font-medium">{item.name}</span>
                    {item.stocks == null ? null : (
                      <Badge variant="outline" className="shrink-0 text-3xs">
                        {t("{count} left", { count: item.stocks })}
                      </Badge>
                    )}
                  </span>
                  {/* No description: the row is just the name (with its stock
                      badge) and the price. A sub-line appears only when the
                      product cannot be sold, to say why. */}
                  {sellable ? null : (
                    <span className="mt-0.5 block text-2xs text-muted-foreground">
                      {availabilityText(
                        lang,
                        availability.code,
                        availabilityLabel(availability.code)
                      )}
                    </span>
                  )}
                </span>

                {/* The price already carries the discount — no strike-through and
                    no percentage: the cashier only needs what will be charged.
                    Same `text-xs` step as the name above. */}
                <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                  {formatCents(discountedUnitCents(toCents(item.price), item.discountPercent))}
                </span>
              </AutocompleteItem>
            )
          }}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}
