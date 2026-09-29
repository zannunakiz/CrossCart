"use client"

/**
 * `/demo` — the QuickStore cashier, playable by anyone.
 *
 * The screen is the cashier (`ProductSearch` → `VoiceOrder` → `SaleCart` →
 * `ReceiptPanel`, plus the mobile total bar and the stock refresh), but it lives
 * OUTSIDE the `(main)` route group on purpose: that shell redirects guests to
 * `/`, and this page must open for signed-in users and guests alike.
 *
 * Nothing here touches a database or a Server Action. The catalog comes from
 * `lib/demo/demo.ts`, "stock" is reduced in memory, the voice interpreter is a
 * local parser, and every request-like step waits `DEMO_LATENCY_MS` so the real
 * loading states (first paint, "Interpreting the order…", "Recording sale…")
 * are still visible.
 *
 * After a sale is confirmed the page offers the two exports the history tab has,
 * for this receipt only: a CSV sheet and a PNG image.
 */
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Download,
  ImageDown,
  Loader2,
  Moon,
  Package,
  RefreshCw,
  ShoppingCart,
  Sun,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { DemoItemsTab } from "@/components/demo/demo-items-tab"
import { ProductSearch } from "@/components/quickstore/cashier/product-search"
import { ReceiptPanel } from "@/components/quickstore/cashier/receipt-panel"
import { SaleCart } from "@/components/quickstore/cashier/sale-cart"
import { VoiceOrder } from "@/components/quickstore/cashier/voice-order"
import { StoreStatusLine } from "@/components/quickstore/store-status-line"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { TabNav, type TabNavItem } from "@/components/ui/tab-nav"
import { ok } from "@/lib/actions/result"
import {
  DEMO_CASHIER_NAME,
  DEMO_STORE,
  buildDemoReceipt,
  demoItemsSnapshot,
  interpretDemoVoiceOrder,
  sellDemoStock,
  waitForDemo,
  type DemoItem,
} from "@/lib/demo/demo"
import { UNKNOWN_ERROR_PHRASE, serverText, useTranslation } from "@/lib/i18n"
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setLanguage,
  subscribePreferences,
  toggleTheme,
} from "@/lib/preferences"
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
  type Receipt,
  type SaleLine,
} from "@/lib/quickstore/cashier"
import { downloadCsv } from "@/lib/quickstore/csv"
import { downloadReceiptImage, renderReceiptImage } from "@/lib/quickstore/receipt-image"
import type { VoiceLanguage } from "@/lib/quickstore/voice-order"

/** The two halves of the demo page, in tab-strip order. */
type DemoTab = "items" | "cashier"

export default function DemoPage() {
  const { lang, t } = useTranslation()
  // Theme comes from the same store the landing page and the app shell use: the
  // writing helpers mirror it onto <html> themselves, so nothing extra is needed
  // to switch the whole page between dark and light.
  const dark = useSyncExternalStore(
    subscribePreferences,
    getThemeSnapshot,
    getServerThemeSnapshot
  )

  const [items, setItems] = useState<DemoItem[]>([])
  const [lines, setLines] = useState<SaleLine[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  /** The sale that was just confirmed — the exports below the panel belong to it. */
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null)
  const [exportingImage, setExportingImage] = useState(false)
  /**
   * Which half of the demo is open. The register stays the landing tab: that is
   * what the landing page's "Demo Test" button promises, and it is what `/demo`
   * has always shown.
   */
  const [tab, setTab] = useState<DemoTab>("cashier")
  const shouldReduceMotion = useReducedMotion()
  const entrance = (delay = 0) => ({
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: shouldReduceMotion ? 0.2 : 0.4, delay },
  })

  /** Idempotency key for the next sale, exactly like the cashier keeps one. */
  const requestIdRef = useRef<string>(newClientRequestId())
  /** Sale counter behind `DEMO-0001`, `DEMO-0002`, … */
  const receiptSeqRef = useRef(0)

  const totals = useMemo(() => computeTotals(lines), [lines])

  // ── "Loading" — stands in for GET /stores/:id + GET /items ──────────────────
  const fetchAll = useCallback(async () => {
    await waitForDemo()
    const catalog = demoItemsSnapshot()
    setItems(catalog)
    setLines((prev) => reconcileLines(prev, catalog))
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
  }, [fetchAll])

  /**
   * Voice interpreter handed to the panel: the demo's local parser, wrapped in
   * the same `ActionResult` envelope the OpenRouter Server Action answers with.
   */
  const interpretOrder = useCallback(
    async (_storeId: string, spoken: string, language: VoiceLanguage) =>
      ok(await interpretDemoVoiceOrder(items, spoken, language)),
    [items]
  )

  /** Re-read the catalog — there is no server, so this only replays the delay. */
  const refreshCatalog = useCallback(async () => {
    setRefreshing(true)
    try {
      await waitForDemo()
      setLines((prev) => dropEmptyLines(reconcileLines(prev, items)))
    } finally {
      setRefreshing(false)
    }
  }, [items])

  // ── Cart actions (the same rules as the cashier) ───────────────────────────
  const resetSale = useCallback(() => {
    setLines([])
    requestIdRef.current = newClientRequestId()
  }, [])

  const handleSelect = useCallback((item: CashierItem) => {
    setLines((prev) => addLine(prev, item, 1))
  }, [])

  const handleQuantityChange = useCallback((item: CashierItem, quantity: number) => {
    setLines((prev) => updateLineQuantity(prev, item, quantity))
  }, [])

  const handleRemove = useCallback((itemId: string) => {
    setLines((prev) => {
      const next = removeLine(prev, itemId)
      if (next.length === 0) requestIdRef.current = newClientRequestId()
      return next
    })
  }, [])


  /**
   * Voice order: the panel already showed the detected lines for confirmation,
   * so this only applies the availability rules the cart also enforces. Nothing
   * is silently dropped — unavailable products are reported.
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

  // ── Checkout ───────────────────────────────────────────────────────────────
  /** "POST /checkout": a 1.5 s delay, then a receipt built from the cart. */
  const submitSale = useCallback(async (): Promise<Receipt> => {
    await waitForDemo()

    const sequence = receiptSeqRef.current + 1
    receiptSeqRef.current = sequence
    const receipt = buildDemoReceipt(lines, sequence)

    // The sale took stock off the shelf — in this browser's memory only.
    const nextItems = sellDemoStock(items, lines)
    setItems(nextItems)
    setLines((prev) => dropEmptyLines(reconcileLines(prev, nextItems)))

    return receipt
  }, [items, lines])

  const handleCompleted = useCallback(
    (receipt: Receipt) => {
      toast.success(t("Sale {number} recorded", { number: receipt.receiptNumber }))
      setLastReceipt(receipt)
      // The sale is done — the next one gets a fresh idempotency key.
      requestIdRef.current = newClientRequestId()
    },
    [t]
  )


  // ── Exports (this receipt only) ────────────────────────────────────────────
  /** The same sheet the history tab writes for one receipt: header, lines, totals. */
  const exportCsv = useCallback(() => {
    if (!lastReceipt) return
    try {
      downloadCsv(`receipt-${receiptFileName(lastReceipt.receiptNumber)}.csv`, [
        [t("Receipt"), lastReceipt.receiptNumber],
        [t("Date"), lastReceipt.paidAt],
        [t("Cashier"), lastReceipt.cashierName ?? ""],
        [t("Status"), lastReceipt.status],
        [],
        [t("Item"), t("Quantity"), t("Unit price"), t("Discount %"), t("Line total")],
        ...lastReceipt.lines.map((line) => [
          line.name,
          line.quantity,
          line.unitPricePaid,
          line.discountPercent,
          line.lineTotal,
        ]),
        [],
        [t("Subtotal"), lastReceipt.subtotal],
        [t("Discounts"), lastReceipt.discountTotal],
        [t("Total"), lastReceipt.total],
      ])
      toast.success(t("Receipt exported"))
    } catch (error) {
      toast.error(
        error instanceof Error ? serverText(lang, error.message) : t(UNKNOWN_ERROR_PHRASE)
      )
    }
  }, [lang, lastReceipt, t])

  /** The same receipt as a PNG sheet, with the demo store name on top. */
  const exportImage = useCallback(async () => {
    if (!lastReceipt) return
    setExportingImage(true)
    try {
      const blob = await renderReceiptImage(lastReceipt, {
        storeName: t("Demo Store"),
        locale: lang === "ID" ? "id-ID" : undefined,
        labels: {
          subtotal: t("Subtotal"),
          discounts: t("Discounts"),
          total: t("Total"),
          itemsSold: t("Items sold"),
          voided: t("Voided"),
        },
      })
      downloadReceiptImage(`${receiptFileName(lastReceipt.receiptNumber)}.png`, blob)
      toast.success(t("Receipt image exported"))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? serverText(lang, error.message)
          : t(UNKNOWN_ERROR_PHRASE)
      )
    } finally {
      setExportingImage(false)
    }
  }, [lang, lastReceipt, t])

  // ── Render ─────────────────────────────────────────────────────────────────
  /** The two sections, on the same underlined strip the QuickStore screens use. */
  const demoTabItems: TabNavItem[] = [
    { value: "items", label: t("Demo Items"), icon: Package },
    { value: "cashier", label: t("Demo Cashier"), icon: ShoppingCart },
  ]

  /**
   * The demo owns its own shell — brand, "Live demo" badge and the way back —
   * because this route sits outside the `(main)` group, where the admin navbar
   * lives. Declared once so the loading state and the cashier screen share it.
   */
  const siteHeader = (
    <motion.header
      {...entrance()}
      className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"
    >
      <Link href="/" className="text-sm font-semibold tracking-[-.04em]">
        crosscart<span className="text-primary">.</span>
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {/* Theme + language: the same two controls the app shell and the landing
            page expose, so the demo follows (and can change) the visitor's
            preferences. */}
        <button
          type="button"
          onClick={toggleTheme}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t("nav.toggleTheme")}
          title={t("nav.toggleTheme")}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        <div className="flex items-center gap-2 text-2xs">
          <span
            className={lang === "EN" ? "font-medium text-foreground" : "text-muted-foreground"}
          >
            EN
          </span>
          <Switch
            checked={lang === "ID"}
            onCheckedChange={(checked) => setLanguage(checked ? "ID" : "EN")}
            aria-label={t("nav.toggleLanguage")}
          />
          <span
            className={lang === "ID" ? "font-medium text-foreground" : "text-muted-foreground"}
          >
            ID
          </span>
        </div>

        <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />

        <span className="hidden rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-3xs font-semibold uppercase tracking-wide text-primary sm:inline-block">
          {t("Live demo")}
        </span>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("Back to home")}
        </Link>
      </div>
    </motion.header>
  )

  if (loading) {
    // The same 1.5 s "catalog fetch" the cashier waits for, shell already up.
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {siteHeader}
          <motion.div {...entrance()} className="flex min-h-[60vh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </motion.div>
        </div>
      </div>
    )
  }

  // The screen title names the demo store, split-coloured like every other
  // heading in the app; the two sections are named by the tab strip below.
  const pageTitle = t("Demo Store")
  const titleSplit = Math.ceil(pageTitle.length / 2)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {siteHeader}

        <div className="space-y-4 pb-24 lg:pb-0">
          {/* Title row — the split-colour heading, with the stock refresh (which
              belongs to the register) riding along. */}
          <motion.div {...entrance()} className="flex items-center justify-between gap-3">
            <h1 className="text-4xl md:text-5xl font-light tracking-tight">
              <span className="text-primary">{pageTitle.slice(0, titleSplit)}</span>
              <span className="text-foreground">{pageTitle.slice(titleSplit)}</span>
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

          <motion.div {...entrance(0.05)} className="space-y-1.5">
            <StoreStatusLine open={DEMO_STORE.open} role={DEMO_STORE.role} />
            <p className="text-2xs text-muted-foreground">
              {t("Demo only — nothing is saved to a database.")}
            </p>
          </motion.div>

          {/* The two sections, on the same full-width underlined strip (and the
              same spring-animated marker) the QuickStore screens use. */}
          <motion.div {...entrance(0.08)}>
            <TabNav
              items={demoTabItems}
              activeValue={tab}
              onSelect={(value) => setTab(value as DemoTab)}
              ariaLabel={t("Demo sections")}
              layoutId="demo-tabs"
            />
          </motion.div>

          {/*
           * Only the open section is mounted, so each one replays its own entrance
           * every time the visitor switches to it — the catalog rows cascade, and
           * the register's panels come back in their order.
           */}
          {tab === "items" ? (
            <motion.div {...entrance(0.12)}>
              <DemoItemsTab items={items} />
            </motion.div>
          ) : (
            <>
              {/*
               * `min-w-0` on both columns is load-bearing: a grid item's automatic
               * minimum size is its min-content width, and the voice panel's truncated
               * (nowrap) hint line made that 368px — on a phone the single column would
               * otherwise push the whole screen sideways, exactly as on the cashier.
               */}
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                {/* Entry column */}
                <motion.div {...entrance(0.1)} className="min-w-0 space-y-4">
                  <motion.div {...entrance(0.14)}>
                    <ProductSearch items={items} onSelect={handleSelect} />
                  </motion.div>

                  {/* Voice entry — hands the same kind of lines to the cart as search. */}
                  <motion.div {...entrance(0.18)}>
                    <VoiceOrder
                      storeId={DEMO_STORE.id}
                      items={items}
                      onAdd={handleVoiceAdd}
                      interpretOrder={interpretOrder}
                    />
                  </motion.div>

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
                </motion.div>

                {/* Receipt / checkout column */}
                <motion.div {...entrance(0.16)} className="min-w-0 lg:sticky lg:top-4 lg:self-start">
                  <ReceiptPanel
                    store={{ paymentQr: DEMO_STORE.paymentQr, open: DEMO_STORE.open }}
                    lines={lines}
                    totals={totals}
                    cashierName={DEMO_CASHIER_NAME}
                    onSubmit={submitSale}
                    onCompleted={handleCompleted}
                    onNewSale={resetSale}
                  />

                  {/* This sale on its own — the sheet and the picture, side by side. */}
                  {lastReceipt ? (
                    <motion.div {...entrance(0.2)} className="mt-4 border border-border bg-card p-4">
                      <p className="text-sm font-bold">{t("Export this sale")}</p>
                      <p className="mt-0.5 font-mono text-2xs text-muted-foreground">
                        {lastReceipt.receiptNumber}
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          id="demo-export-csv"
                          type="button"
                          size="sm"
                          className="w-full gap-1.5"
                          onClick={exportCsv}
                        >
                          <Download className="size-3.5" />
                          {t("Export CSV")}
                        </Button>

                        <Button
                          id="demo-export-image"
                          type="button"
                          size="sm"
                          /* Green marks the picture: the CSV keeps the primary colour. */
                          className="w-full gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:text-white dark:hover:bg-green-700"
                          aria-busy={exportingImage}
                          disabled={exportingImage}
                          onClick={() => void exportImage()}
                        >
                          {exportingImage ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ImageDown className="size-3.5" />
                          )}
                          {exportingImage ? t("Exporting…") : t("Export PNG")}
                        </Button>
                      </div>
                    </motion.div>
                  ) : null}
                </motion.div>
              </div>

              {/*
               * Mobile: the running total and the way to the receipt + payment stay
               * in reach no matter how long the cart is. One tap scrolls to
               * #checkout-panel (smooth scrolling is enabled globally in globals.css).
               */}
              {lines.length > 0 && (
                <motion.div
                  {...entrance(0.28)}
                  className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden"
                >
                  <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-2xs text-muted-foreground">
                        {t(totals.itemCount === 1 ? "{count} item" : "{count} items", {
                          count: totals.itemCount,
                        })}
                      </p>
                      <p className="text-base font-bold tabular-nums">
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Drop the lines a refreshed catalog clamped to zero (the last unit was sold). */
function dropEmptyLines(lines: SaleLine[]): SaleLine[] {
  return lines.filter((line) => line.quantity > 0)
}

/** Filename-safe receipt number — "/" or a space would break the download name. */
function receiptFileName(receiptNumber: string): string {
  const cleaned = receiptNumber.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "")
  return cleaned || "receipt"
}

