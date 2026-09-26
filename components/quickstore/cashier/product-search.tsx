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
import {
  MAX_SUGGESTIONS,
  availabilityLabel,
  checkAvailability,
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
 * reason — but cannot be selected.
 */
export function ProductSearch({ items, onSelect, disabled = false }: Props) {
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
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <AutocompleteInput
          ref={inputRef}
          id="product-search-input"
          aria-label="Search products"
          placeholder="Type a product name…"
          className="h-10 pl-8"
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      <AutocompleteContent>
        <AutocompleteEmpty>
          {query.trim() === ""
            ? "Start typing to search products"
            : `No product matches “${query.trim()}”`}
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
                className="items-start gap-3 py-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold uppercase text-muted-foreground">
                  {item.name.slice(0, 2)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    {item.stocks == null ? null : (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.stocks} left
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {sellable
                      ? item.description || "Tap to add to the sale"
                      : availabilityLabel(availability.code)}
                  </span>
                </span>

                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCents(toCents(item.price), item.currency)}
                </span>
              </AutocompleteItem>
            )
          }}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}
