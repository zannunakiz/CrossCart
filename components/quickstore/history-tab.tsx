"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, Receipt as ReceiptIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCents, toCents, type Receipt } from "@/lib/quickstore/cashier"
import { serverText, useTranslation } from "@/lib/i18n"

interface Props {
  storeId: string
}

/**
 * QuickStore transaction history — the read side of the cashier.
 * Each row expands into the exact receipt lines that were recorded.
 */
export function HistoryTab({ storeId }: Props) {
  const { lang, t } = useTranslation()
  const [sales, setSales] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/history?limit=50`)
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? t("Failed to load history"))
      }
      setSales((await res.json()) as Receipt[])
      setError(null)
    } catch (err) {
      const message =
        err instanceof Error ? serverText(lang, err.message) : t("Failed to load history")
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [storeId, lang, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory()
  }, [fetchHistory])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center border border-dashed border-destructive/40 bg-card py-12 text-center">
        <p className="font-semibold text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void fetchHistory()}>
          {t("Try again")}
        </Button>
      </div>
    )
  }

  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card py-16 text-center">
        <ReceiptIcon className="mb-3 size-10 text-muted-foreground/50" />
        <p className="font-semibold">{t("No sales yet")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Completed cashier checkouts appear here.")}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("{count} recorded sales · newest first", { count: sales.length })}
      </p>

      <ul className="divide-y divide-border border border-border bg-card">
        {sales.map((sale) => {
          const isOpen = expanded === sale.id

          return (
            <li key={sale.id} data-testid={`history-sale-${sale.receiptNumber}`}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : sale.id)}
              >
                <span className="text-muted-foreground">
                  {isOpen ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{sale.receiptNumber}</span>
                    {sale.status !== "completed" && (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {sale.status}
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {new Date(sale.paidAt).toLocaleString(
                      lang === "ID" ? "id-ID" : undefined
                    )}{" "}
                    · {sale.cashierName ?? t("Unknown cashier")}{" "}
                    · {t(sale.itemCount === 1 ? "{count} item" : "{count} items", { count: sale.itemCount })}
                  </span>
                </span>

                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCents(toCents(sale.total), sale.currency)}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-border bg-muted/20 px-4 py-3">
                  <ul className="space-y-1.5">
                    {sale.lines.map((line) => (
                      <li key={line.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate">
                          {line.name}
                          <span className="text-muted-foreground">
                            {" · "}
                            {line.quantity} ×{" "}
                            {formatCents(toCents(line.unitPricePaid), sale.currency)}
                            {line.discountPercent > 0 && ` (−${line.discountPercent}%)`}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatCents(toCents(line.lineTotal), sale.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                    <span className="text-muted-foreground">
                      {t("Subtotal")} {formatCents(toCents(sale.subtotal), sale.currency)}
                      {toCents(sale.discountTotal) > 0 &&
                        ` · ${t("Discounts")} −${formatCents(toCents(sale.discountTotal), sale.currency)}`}
                    </span>
                    <span className="font-semibold">
                      {t("Total")} {formatCents(toCents(sale.total), sale.currency)}
                    </span>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

