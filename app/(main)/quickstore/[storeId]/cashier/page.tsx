"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Package2, RefreshCw, ShieldAlert, Store as StoreIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ProductSearch } from "@/components/quickstore/cashier/product-search"
import { ReceiptPanel } from "@/components/quickstore/cashier/receipt-panel"
import { SaleCart } from "@/components/quickstore/cashier/sale-cart"
import { VoiceOrder } from "@/components/quickstore/cashier/voice-order"
import { StoreStatusBar } from "@/components/quickstore/store-status-bar"
import { useQuickStoreHeader } from "@/components/quickstore/store-header-context"
import type { StoreItem, StoreRole } from "@/lib/db/schema"
import { hasPermission } from "@/lib/quickstore/permissions"
import { checkoutErrorText, serverText, useTranslation } from "@/lib/i18n"
import {
  addLine,
  checkAvailability,
  computeTotals,
  formatCents,
  newClientRequestId,
  reconcileLines,
  removeLine,
  updateLineQuantity,
  type CashierItem,
  type CheckoutIssue,
  type Receipt,
  type SaleLine,
} from "@/lib/quickstore/cashier"

interface StoreWithRole {
  id: string
  name: string
  description: string | null
  open: boolean
  paymentQr: string | null
  role: StoreRole
}

export default function CashierPage() {
  const { storeId } = useParams<{ storeId: string }>()
  const router = useRouter()
  const { lang, t } = useTranslation()
  const { setHeader } = useQuickStoreHeader()

  const [store, setStore] = useState<StoreWithRole | null>(null)
  const [items, setItems] = useState<StoreItem[]>([])
  const [lines, setLines] = useState<SaleLine[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Idempotency key for THIS sale. It survives retries (so a request whose
   * response was lost replays instead of selling twice) and is regenerated only
   * when the sale is finished or the cart is emptied.
   */
  const requestIdRef = useRef<string>(newClientRequestId())

  const totals = useMemo(() => computeTotals(lines), [lines])

  // ── Loading ────────────────────────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    const res = await fetch(`/api/quickstore/stores/${storeId}/items`)
    if (!res.ok) throw new Error(res.status === 403 ? "Forbidden" : "Failed to load products")
    return (await res.json()) as StoreItem[]
  }, [storeId])

  const fetchAll = useCallback(async () => {
    try {
      // The store is fetched first: its status decides whether this route even
      // exists for the caller, and a failing catalog request must not mask it.
      const storeRes = await fetch(`/api/quickstore/stores/${storeId}`)

      // No access → store list. Unknown store id → the shared 404 screen.
      if (storeRes.status === 401 || storeRes.status === 403) {
        router.replace("/quickstore")
        return
      }
      if (storeRes.status === 404) {
        router.replace("/not-found")
        return
      }
      if (!storeRes.ok) throw new Error("Failed to load store")

      const [storeData, catalog] = await Promise.all([
        storeRes.json() as Promise<StoreWithRole>,
        loadCatalog(),
      ])

      setStore(storeData)
      setItems(catalog)
      setLines((prev) => reconcileLines(prev, catalog))
      setLoadError(null)
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? serverText(lang, error.message)
          : t("Failed to load the cashier")
      )
    } finally {
      setLoading(false)
    }
  }, [loadCatalog, router, storeId, lang, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
  }, [fetchAll])

  /**
   * Publish the same breadcrumb as the store page (`Quick Store › {name}
   * {open/closed} {role}`) so the navbar stays identical on the cashier route.
   */
  useEffect(() => {
    if (!store) return
    setHeader({ storeId: store.id, name: store.name, open: store.open, role: store.role })
  }, [store, setHeader])

  useEffect(() => () => setHeader(null), [setHeader])

  /** Re-read stock (another cashier may have sold the last unit). */
  const refreshCatalog = useCallback(async () => {
    setRefreshing(true)
    try {
      const catalog = await loadCatalog()
      setItems(catalog)
      setLines((prev) => reconcileLines(prev, catalog))
    } catch {
      toast.error(t("Could not refresh stock"))
    } finally {
      setRefreshing(false)
    }
  }, [loadCatalog, t])

  // ── Cart actions ───────────────────────────────────────────────────────────
  const resetSale = useCallback(() => {
    setLines([])
    requestIdRef.current = newClientRequestId()
  }, [])

  const handleSelect = useCallback(
    (item: CashierItem) => {
      setLines((prev) => addLine(prev, item, 1))
    },
    []
  )

  const handleQuantityChange = useCallback((item: CashierItem, quantity: number) => {
    setLines((prev) => updateLineQuantity(prev, item, quantity))
  }, [])

  /**
   * Voice order: the panel already showed the detected lines for confirmation,
   * so this only has to apply the availability rules the cart also enforces.
   * Nothing is silently dropped — unavailable products are reported.
   */
  const handleVoiceAdd = useCallback(
    (picked: readonly { item: CashierItem; quantity: number }[]) => {
      const accepted: { item: CashierItem; quantity: number }[] = []
      let skipped = 0

      for (const entry of picked) {
        const availability = checkAvailability(entry.item, entry.quantity)
        if (availability.ok) {
          accepted.push(entry)
        } else if (availability.orderable && availability.orderable > 0) {
          // Clamp to what is actually left instead of refusing the whole line.
          accepted.push({ item: entry.item, quantity: availability.orderable })
        } else {
          skipped += 1
        }
      }

      if (accepted.length > 0) {
        setLines((prev) =>
          accepted.reduce((acc, entry) => addLine(acc, entry.item, entry.quantity), prev)
        )
      }
      if (skipped > 0) {
        toast.warning(t("Unavailable items were skipped: {count}", { count: skipped }))
      }
    },
    [t]
  )

  const handleRemove = useCallback(
    (itemId: string) => {
      // A brand new sale starts once the last line is gone → fresh idempotency key.
      setLines((prev) => {
        const next = removeLine(prev, itemId)
        if (next.length === 0) requestIdRef.current = newClientRequestId()
        return next
      })
    },
    []
  )

  // ── Checkout ───────────────────────────────────────────────────────────────
  /** POST the sale; the server re-validates stock and records history. */
  const submitSale = useCallback(async (): Promise<Receipt> => {
    const res = await fetch(`/api/quickstore/stores/${storeId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestIdRef.current,
        lines: lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
      }),
    })

    const payload = (await res.json().catch(() => ({}))) as {
      sale?: Receipt
      error?: string
      code?: string
      issues?: CheckoutIssue[]
    }

    if (!res.ok || !payload.sale) {
      const error = new Error(payload.error ?? t("Checkout failed")) as Error & {
        code?: string
        issues?: CheckoutIssue[]
      }
      error.code = payload.code
      error.issues = payload.issues
      throw error
    }

    return payload.sale
  }, [lines, storeId, t])

  const handleCompleted = useCallback(
    (receipt: Receipt) => {
      toast.success(t("Sale {number} recorded", { number: receipt.receiptNumber }))
      // The sale is done — the next one gets a fresh idempotency key.
      requestIdRef.current = newClientRequestId()
      // Stock changed on the server: pull the new numbers in.
      void refreshCatalog()
    },
    [refreshCatalog, t]
  )

  /** Stale stock / unavailable products: refresh and clamp the cart. */
  const handleIssues = useCallback(
    (issues: CheckoutIssue[]) => {
      toast.error(
        issues
          .map((issue) => checkoutErrorText(lang, issue.code, issue.message))
          .join(", ")
      )
      void refreshCatalog()
    },
    [refreshCatalog, lang]
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError || !store) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <StoreIcon className="size-12 text-muted-foreground" />
        <p className="font-semibold">{loadError ?? t("Store not found")}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchAll()}>
            {t("Try again")}
          </Button>
          <Link href="/quickstore">
            <Button variant="ghost" size="sm">
              {t("Back to Quick Store")}
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (!hasPermission(store.role, "sale:create")) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <ShieldAlert className="size-12 text-muted-foreground" />
        <div>
          <p className="font-semibold">{t("You cannot ring up sales here")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Your role in this store does not allow checking out.")}
          </p>
        </div>
        <Link href={`/quickstore/${storeId}`}>
          <Button variant="outline" size="sm">
            {t("Back to store")}
          </Button>
        </Link>
      </div>
    )
  }


  return (
    <div className="space-y-5">
      {/*
       * The store name stays in the navbar breadcrumb; the open/closed state and
       * the user's role moved here (see `StoreStatusBar`) — no cashier shortcut
       * because this IS the cashier route.
       */}
      <StoreStatusBar
        storeId={storeId}
        open={store.open}
        role={store.role}
        showCashier={false}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t("Enter the customer's items, review the receipt, then confirm the payment.")}
        </p>

        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 self-start"
          onClick={() => void refreshCatalog()}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {t("Refresh stock")}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Entry column */}
        <div className="space-y-4">
          <ProductSearch items={items} onSelect={handleSelect} />

          {/* Voice entry — hands the same kind of lines to the cart as search. */}
          {items.length > 0 ? (
            <VoiceOrder storeId={storeId} items={items} onAdd={handleVoiceAdd} />
          ) : null}

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card px-6 py-14 text-center">
              <Package2 className="mb-3 size-10 text-muted-foreground/50" />
              <p className="font-semibold">{t("No products yet")}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {t("Add items to this store before you can ring up a sale.")}
              </p>
              <Link href={`/quickstore/${storeId}`} className="mt-4">
                <Button size="sm">{t("Add items")}</Button>
              </Link>
            </div>
          ) : (
            <SaleCart
              lines={lines}
              catalog={items}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemove}
              onClear={resetSale}
              emptyHint={t("Search for a product above, or tap a suggestion to add it.")}
            />
          )}

          {/* Mobile shortcut to the checkout panel */}
          {lines.length > 0 && (
            <a
              href="#checkout-panel"
              className="flex items-center justify-between border border-border bg-card px-4 py-3 text-sm font-semibold lg:hidden"
            >
              <span>{t("Total")}</span>
              <span className="tabular-nums">
                {formatCents(totals.totalCents, totals.currency)} · {t("Review")} ↓
              </span>
            </a>
          )}
        </div>

        {/* Receipt / checkout column */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <ReceiptPanel
            store={{ name: store.name, paymentQr: store.paymentQr, open: store.open }}
            lines={lines}
            totals={totals}
            onSubmit={submitSale}
            onCompleted={handleCompleted}
            onIssues={handleIssues}
            onNewSale={resetSale}
          />
        </div>
      </div>
    </div>
  )
}

