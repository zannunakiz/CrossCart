"use client"

import { ArrowRight, Loader2, Package2, RefreshCw, ShieldAlert, Store as StoreIcon } from "lucide-react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ProductSearch } from "@/components/quickstore/cashier/product-search"
import { ReceiptPanel } from "@/components/quickstore/cashier/receipt-panel"
import { SaleCart } from "@/components/quickstore/cashier/sale-cart"
import { VoiceOrder } from "@/components/quickstore/cashier/voice-order"
import { useQuickStoreHeader } from "@/components/quickstore/store-header-context"
import { StoreStatusLine } from "@/components/quickstore/store-status-line"
import { Button } from "@/components/ui/button"
import { listStoreItems } from "@/lib/actions/item-actions"
import { checkoutSale } from "@/lib/actions/sale-actions"
import { getStore } from "@/lib/actions/store-actions"
import type { StoreItem, StoreRole } from "@/lib/db/schema"
import {
  UNKNOWN_ERROR_PHRASE,
  checkoutErrorText,
  serverText,
  useTranslation,
} from "@/lib/i18n"
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
import { hasPermission } from "@/lib/quickstore/permissions"

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
  const shouldReduceMotion = useReducedMotion()
  const entrance = (delay = 0) => ({
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: shouldReduceMotion ? 0.2 : 0.4, delay },
  })

  /**
   * Idempotency key for THIS sale. It survives retries (so a request whose
   * response was lost replays instead of selling twice) and is regenerated only
   * when the sale is finished or the cart is emptied.
   */
  const requestIdRef = useRef<string>(newClientRequestId())

  const totals = useMemo(() => computeTotals(lines), [lines])

  // ── Loading ────────────────────────────────────────────────────────────────
  const loadCatalog = useCallback(async () => {
    const res = await listStoreItems(storeId)
    if (!res.ok) throw new Error(res.status === 403 ? "Forbidden" : "Failed to load products")
    return res.data
  }, [storeId])

  const fetchAll = useCallback(async () => {
    try {
      // The store is fetched first: its status decides whether this route even
      // exists for the caller, and a failing catalog request must not mask it.
      const storeRes = await getStore(storeId)

      // No access → store list. Unknown store id → the shared 404 screen.
      if (!storeRes.ok && (storeRes.status === 401 || storeRes.status === 403)) {
        router.replace("/quickstore")
        return
      }
      if (!storeRes.ok && storeRes.status === 404) {
        router.replace("/not-found")
        return
      }
      if (!storeRes.ok) throw new Error(storeRes.error)

      const [storeData, catalog] = await Promise.all([storeRes.data, loadCatalog()])

      setStore(storeData)
      setItems(catalog)
      setLines((prev) => reconcileLines(prev, catalog))
      setLoadError(null)
    } catch (error) {
      setLoadError(
        error instanceof Error ? serverText(lang, error.message) : t(UNKNOWN_ERROR_PHRASE)
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
  /** Records the sale; the server re-validates stock and writes history. */
  const submitSale = useCallback(async (): Promise<Receipt> => {
    const res = await checkoutSale(storeId, {
      clientRequestId: requestIdRef.current,
      lines: lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
    })

    if (!res.ok) {
      const error = new Error(res.error) as Error & {
        code?: string
        issues?: CheckoutIssue[]
      }
      error.code = res.code
      error.issues = res.issues
      throw error
    }

    return res.data.sale
  }, [lines, storeId])

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
      <motion.div {...entrance()} className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </motion.div>
    )
  }

  if (loadError || !store) {
    return (
      <motion.div {...entrance()} className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
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
      </motion.div>
    )
  }

  if (!hasPermission(store.role, "sale:create")) {
    return (
      <motion.div {...entrance()} className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
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
      </motion.div>
    )
  }

  // The screen title carries the primary colour on its first half, exactly like
  // the "Quick Store" heading on the store list.
  const cashierTitle = t("Cashier")
  const titleSplit = Math.ceil(cashierTitle.length / 2)

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {/*
       * Two rows before the content, same shape as the store detail page:
       *   row 1 — the title ("Cashier" / "Kasir"), split-colour and light weight;
       *   row 2 — the status / role line (`STATUS: open • ROLE: admin`).
       * The stock refresh rides along on the title row.
       */}
      <motion.div {...entrance()} className="flex items-center justify-between gap-3">
        <h1 className="text-4xl md:text-5xl font-light tracking-tight">
          <span className="text-primary">{cashierTitle.slice(0, titleSplit)}</span>
          <span className="text-foreground">{cashierTitle.slice(titleSplit)}</span>
        </h1>

        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label={t("Refresh stock")}
          title={t("Refresh stock")}
          onClick={() => void refreshCatalog()}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </motion.div>

      <motion.div {...entrance(0.05)}>
        <StoreStatusLine open={store.open} role={store.role} />
      </motion.div>

      {/*
       * `min-w-0` on both columns is load-bearing: a grid item's automatic
       * minimum size is its min-content width, and the voice panel's truncated
       * (nowrap) hint line made that 368px. On a 375px phone the page only has
       * 343px for the grid, so the single mobile column pushed the whole screen
       * sideways (worse on a 360px Galaxy A55). Letting the columns shrink keeps
       * the layout at the container width and lets truncation ellipsize instead.
       */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Entry column */}
        <motion.div {...entrance(0.1)} className="min-w-0 space-y-4">
          <motion.div {...entrance(0.14)}>
            <ProductSearch items={items} onSelect={handleSelect} />
          </motion.div>

          {/* Voice entry — hands the same kind of lines to the cart as search. */}
          {items.length > 0 ? (
            <motion.div {...entrance(0.18)}>
              <VoiceOrder storeId={storeId} items={items} onAdd={handleVoiceAdd} />
            </motion.div>
          ) : null}

          {items.length === 0 ? (
            <motion.div {...entrance(0.22)} className="flex flex-col items-center justify-center border border-dashed border-border bg-card px-6 py-14 text-center">
              <Package2 className="mb-3 size-10 text-muted-foreground/50" />
              <p className="font-semibold">{t("No products yet")}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {t("Add items to this store before you can ring up a sale.")}
              </p>
              <Link href={`/quickstore/${storeId}`} className="mt-4">
                <Button size="sm">{t("Add items")}</Button>
              </Link>
            </motion.div>
          ) : (
            <motion.div {...entrance(0.22)}>
              <SaleCart
                lines={lines}
                catalog={items}
                onQuantityChange={handleQuantityChange}
                onRemove={handleRemove}
                onClear={resetSale}
                emptyHint={t("Search for a product above, or tap a suggestion to add it.")}
              />
            </motion.div>
          )}
        </motion.div>

        {/* Receipt / checkout column */}
        <motion.div {...entrance(0.16)} className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <ReceiptPanel
            store={{ paymentQr: store.paymentQr, open: store.open }}
            lines={lines}
            totals={totals}
            onSubmit={submitSale}
            onCompleted={handleCompleted}
            onIssues={handleIssues}
            onNewSale={resetSale}
          />
        </motion.div>
      </div>

      {/*
       * Mobile: the running total and the way to the receipt + payment stay in
       * reach no matter how long the cart is. One tap scrolls to #checkout-panel
       * (smooth scrolling is enabled globally in globals.css).
       */}
      {lines.length > 0 && (
        <motion.div {...entrance(0.28)} className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-2xs text-muted-foreground">
                {t(totals.itemCount === 1 ? "{count} item" : "{count} items", {
                  count: totals.itemCount,
                })}
              </p>
              <p className="text-base font-bold tabular-nums" data-testid="cart-total-bar">
                {formatCents(totals.totalCents)}
              </p>
            </div>

            <a href="#checkout-panel" className="shrink-0">
              <Button className="h-9 gap-1.5">
                {t("Review & pay")}
                <ArrowRight className="size-3.5" />
              </Button>
            </a>
          </div>
        </motion.div>
      )}
    </div>
  )
}
