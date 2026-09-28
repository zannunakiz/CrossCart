"use client"

import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { CheckCircle2, Loader2, QrCode, RefreshCw, Store, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { checkoutErrorText, useTranslation } from "@/lib/i18n"
import {
  checkoutReducer,
  formatCents,
  initialCheckoutState,
  toCents,
  type CheckoutErrorCode,
  type CheckoutIssue,
  type Receipt,
  type SaleLine,
  type SaleTotals,
} from "@/lib/quickstore/cashier"

export interface ReceiptPanelStore {
  name: string
  paymentQr: string | null
  open: boolean
}

interface Props {
  store: ReceiptPanelStore
  lines: readonly SaleLine[]
  totals: SaleTotals
  cashierName?: string | null
  /** Performs the actual POST /checkout and resolves with the stored sale. */
  onSubmit: () => Promise<Receipt>
  /** Called once a sale is recorded so the page can refresh stocks + history. */
  onCompleted: (receipt: Receipt) => void
  /** Called when the server rejects lines (stale stock) so the page can refresh. */
  onIssues?: (issues: CheckoutIssue[]) => void
  /** Clears the cart when the cashier starts a new sale. */
  onNewSale: () => void
  disabled?: boolean
}

/** `itemId:qty|itemId:qty` — used to detect cart edits mid-confirmation. */
function cartSignature(lines: readonly SaleLine[]): string {
  return lines.map((line) => `${line.itemId}:${line.quantity}`).join("|")
}

/**
 * Receipt preview + the confirmation flow.
 *
 *   Confirm → 3 s countdown (button locked) → Confirm →
 *   "Customer Paid?" Yes/No → Yes records the sale, No returns to Confirm.
 *
 * The panel never mutates stock or history itself: it only calls `onSubmit`,
 * and the server decides. That keeps duplicate submissions and stale stock
 * handled in one place.
 */
export function ReceiptPanel({
  store,
  lines,
  totals,
  cashierName,
  onSubmit,
  onCompleted,
  onIssues,
  onNewSale,
  disabled = false,
}: Props) {
  const { lang, t } = useTranslation()
  const [state, dispatch] = useReducer(checkoutReducer, undefined, initialCheckoutState)
  const [clock, setClock] = useState<string>("")

  const signature = useMemo(() => cartSignature(lines), [lines])
  const isEmpty = lines.length === 0
  const locked = disabled || isEmpty

  // Live draft timestamp (kept in state so SSR and client agree).
  useEffect(() => {
    const update = () => setClock(new Date().toLocaleString())
    update()
    const timer = setInterval(update, 30_000)
    return () => clearInterval(timer)
  }, [])

  // 1-second tick while the confirmation countdown runs.
  useEffect(() => {
    if (state.phase !== "countdown") return
    const timer = setInterval(() => dispatch({ type: "TICK" }), 1000)
    return () => clearInterval(timer)
  }, [state.phase])

  // Editing the cart invalidates an in-flight confirmation.
  useEffect(() => {
    if (state.phase === "idle" || state.phase === "submitting" || state.phase === "completed") return
    dispatch({ type: "RESET" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  /**
   * Keep the latest callbacks in a ref so the submit effect below runs exactly
   * once per `submitting` phase, even if a parent re-render swaps the props.
   * (Refs are written in an effect — never during render.)
   */
  const handlersRef = useRef({ onSubmit, onCompleted, onIssues })
  useEffect(() => {
    handlersRef.current = { onSubmit, onCompleted, onIssues }
  }, [onSubmit, onCompleted, onIssues])

  /**
   * The POST happens in an effect (never straight from the click handler) so a
   * single `submitting` state always issues exactly one request — a second
   * click cannot queue a duplicate sale.
   */
  useEffect(() => {
    if (state.phase !== "submitting") return
    let cancelled = false

    void (async () => {
      try {
        const receipt = await handlersRef.current.onSubmit()
        if (cancelled) return
        dispatch({ type: "SUBMIT_SUCCESS", receipt })
        handlersRef.current.onCompleted(receipt)
      } catch (error) {
        if (cancelled) return
        const issues = (error as { issues?: CheckoutIssue[] }).issues
        if (issues?.length) handlersRef.current.onIssues?.(issues)
        dispatch({
          type: "SUBMIT_ERROR",
          message: error instanceof Error ? error.message : t("Checkout failed"),
          code: (error as { code?: CheckoutErrorCode }).code,
        })
      }
    })()

    return () => {
      cancelled = true
    }
    // `t` is intentionally omitted: the request must fire exactly once per
    // `submitting` phase, even if the language changes mid-checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])


  const completed = state.phase === "completed" ? state.receipt : null

  // Receipt rows come from the server once the sale is recorded, otherwise from
  // the live cart (so the cashier reviews exactly what will be charged).
  const rows = completed
    ? completed.lines.map((line) => ({
        key: line.id,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitPricePaid: line.unitPricePaid,
        discountPercent: line.discountPercent,
        lineTotal: line.lineTotal,
      }))
    : lines.map((line) => ({
        key: line.itemId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: (line.unitPriceCents / 100).toFixed(2),
        unitPricePaid: (line.unitPricePaidCents / 100).toFixed(2),
        discountPercent: line.discountPercent,
        lineTotal: (line.lineTotalCents / 100).toFixed(2),
      }))

  const display = completed
    ? {
        currency: completed.currency,
        subtotalCents: toCents(completed.subtotal),
        discountTotalCents: toCents(completed.discountTotal),
        totalCents: toCents(completed.total),
        itemCount: completed.itemCount,
        lineCount: completed.lineCount,
      }
    : totals

  return (
    <section
      id="checkout-panel"
      data-testid="receipt-panel"
      aria-label={t("Receipt and checkout")}
      className="scroll-mt-20 border border-border bg-card"
    >
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Store className="size-3.5 text-muted-foreground" />
              <span className="truncate">{store.name}</span>
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {completed ? t("Receipt") : t("Draft receipt")} ·{" "}
              {completed
                ? new Date(completed.paidAt).toLocaleString(
                    lang === "ID" ? "id-ID" : undefined
                  )
                : clock || "—"}
            </p>
            {cashierName && (
              <p className="text-2xs text-muted-foreground">
                {t("Cashier: {name}", { name: cashierName })}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="outline" className="font-mono text-3xs">
              {completed ? completed.receiptNumber : t("NOT RECORDED")}
            </Badge>
            {!store.open && (
              <Badge variant="secondary" className="text-3xs">
                {t("Store closed")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Lines — desktop only: the cart above already lists them on mobile. */}
      <div className="hidden px-4 py-3 lg:block">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("Nothing to sell yet — add a product to build the receipt.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="text-2xs text-muted-foreground">
                    {row.quantity} × {formatCents(toCents(row.unitPricePaid), display.currency)}
                    {row.discountPercent > 0 &&
                      ` ${t("(list {price})", {
                        price: formatCents(toCents(row.unitPrice), display.currency),
                      })}`}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatCents(toCents(row.lineTotal), display.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      {/* Totals */}
      <div className="space-y-1.5 px-4 py-3 text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{t("Subtotal")}</span>
          <span className="tabular-nums">{formatCents(display.subtotalCents, display.currency)}</span>
        </div>
        {display.discountTotalCents > 0 && (
          <div className="flex items-center justify-between text-muted-foreground">
            <span>{t("Discounts")}</span>
            <span className="tabular-nums">
              −{formatCents(display.discountTotalCents, display.currency)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
          <span>{t("Total")}</span>
          <span className="tabular-nums" data-testid="receipt-total">
            {formatCents(display.totalCents, display.currency)}
          </span>
        </div>
        <p className="text-2xs text-muted-foreground">
          {t(display.itemCount === 1 ? "{count} item" : "{count} items", {
            count: display.itemCount,
          })}{" "}
          ·{" "}
          {t(display.lineCount === 1 ? "{count} line" : "{count} lines", {
            count: display.lineCount,
          })}
        </p>
      </div>

      <Separator />

      {/* Payment QR */}
      <div className="flex items-center gap-3 px-4 py-3">
        {store.paymentQr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.paymentQr}
            alt={t("Payment QR")}
            className="size-20 shrink-0 rounded-md border border-border bg-muted object-contain"
          />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
            <QrCode className="size-6" />
          </span>
        )}
        <div className="text-2xs text-muted-foreground">
          <p className="text-xs font-medium text-foreground">{t("Scan to pay")}</p>
          {store.paymentQr ? (
            <p>{t("Show this QR to the customer, then confirm the payment below.")}</p>
          ) : (
            <p>{t("No payment QR configured — add one in the store settings.")}</p>
          )}
        </div>
      </div>


      {/* Confirmation flow. `[&_button]:h-9` keeps every action thumb-sized. */}
      <div className="border-t border-border bg-muted/30 p-4 [&_button]:h-9">
        {completed && (
          <div className="space-y-3" data-testid="checkout-success">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              {t("Sale recorded")}
            </p>
            <p className="text-2xs text-muted-foreground">
              {t("Stock has been reduced and the sale saved to QuickStore history as")}{" "}
              <span className="font-mono">{completed.receiptNumber}</span>.
            </p>
            <Button
              className="w-full gap-2"
              onClick={() => {
                dispatch({ type: "RESET" })
                onNewSale()
              }}
            >
              {t("New sale")}
            </Button>
          </div>
        )}

        {state.phase === "countdown" && (
          <div className="space-y-3" data-testid="checkout-countdown">
            <Button className="w-full gap-2" disabled>
              {t("Confirm in {seconds}s…", { seconds: state.secondsLeft })}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => dispatch({ type: "CANCEL_CONFIRM" })}
            >
              {t("Cancel")}
            </Button>
          </div>
        )}

        {(state.phase === "idle" || state.phase === "ready") && (
          <div className="space-y-3">
            <Button
              id="checkout-confirm"
              data-testid="checkout-confirm"
              className="w-full"
              disabled={locked}
              onClick={() =>
                state.phase === "idle"
                  ? dispatch({ type: "START_CONFIRM" })
                  : dispatch({ type: "CONFIRM" })
              }
            >
              Confirm
            </Button>
            <p className="text-2xs text-muted-foreground">
              {state.phase === "idle"
                ? t("Review the receipt, then confirm to start the 3-second safeguard.")
                : t("Confirm once the customer has paid.")}
            </p>
          </div>
        )}

        {state.phase === "awaiting_payment" && (
          <div className="space-y-3" data-testid="checkout-awaiting-payment">
            <p className="text-center text-sm font-semibold">{t("Customer Paid?")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid="checkout-paid-yes" disabled={locked} onClick={() => dispatch({ type: "PAY_YES" })}>
                {t("Yes")}
              </Button>
              <Button
                variant="outline"
                data-testid="checkout-paid-no"
                disabled={locked}
                onClick={() => dispatch({ type: "PAY_NO" })}
              >
                {t("No")}
              </Button>
            </div>
            <p className="text-2xs text-muted-foreground">
              {t("Only “Yes” records the sale and reduces stock.")}
            </p>
          </div>
        )}

        {state.phase === "submitting" && (
          <Button className="w-full gap-2" disabled data-testid="checkout-submitting">
            <Loader2 className="size-4 animate-spin" />
            {t("Recording sale…")}
          </Button>
        )}

        {state.phase === "error" && (
          <div className="space-y-3" data-testid="checkout-error">
            <p className="flex items-start gap-2 text-xs font-medium text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{checkoutErrorText(lang, state.code, state.message)}</span>
            </p>
            <p className="text-2xs text-muted-foreground">
              {t("Nothing has been recorded. Fix the items above and confirm again.")}
            </p>
            <Button
              variant="outline"
              className="w-full gap-2"
              data-testid="checkout-retry"
              onClick={() => dispatch({ type: "START_CONFIRM", seconds: 0 })}
            >
              <RefreshCw className="size-3.5" />
              {t("Back to confirm")}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

