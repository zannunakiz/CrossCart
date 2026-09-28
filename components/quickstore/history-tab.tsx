"use client"

import { motion, useReducedMotion, type Variants } from "framer-motion"
import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Receipt as ReceiptIcon,
  Search,
} from "lucide-react"
import { toast } from "sonner"

import {
  fillSeries,
  HourStrip,
  RevenueLine,
  SliceBars,
  type ChartGranularity,
  type ChartPoint,
  type ChartSlice,
} from "@/components/quickstore/history-charts"
import { usePageSync } from "@/components/quickstore/use-page-sync"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { serverText, useTranslation } from "@/lib/i18n"
import { formatCents, toCents, type Receipt } from "@/lib/quickstore/cashier"
import {
  HISTORY_PAGE_SIZES,
  HISTORY_PRESETS,
  dayLabel,
  historyApiParams,
  withHistoryUrlParams,
  parseHistoryQuery,
  tzOffsetMinutes,
  type HistoryStatus,
} from "@/lib/quickstore/history"
import { cn } from "@/lib/utils"

interface Props {
  storeId: string
}

/** What `/history` answers with. */
interface HistoryPage {
  sales: Receipt[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** What `/history/summary` answers with. */
interface HistorySummary {
  totals: { sales: number; items: number; revenue: string; discount: string }
  granularity: ChartGranularity
  series: ChartPoint[]
  byHour: { hour: number; sales: number; revenue: string }[]
  topItems: ChartSlice[]
  byCashier: ChartSlice[]
}

const PRESET_LABELS = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  all: "All time",
  custom: "Custom",
} as const

const STATUS_LABELS = {
  all: "All statuses",
  completed: "Completed",
  voided: "Voided",
} as const

/**
 * Cubic-bezier shared by every entrance in this file.
 *
 * Kept next to the labels (not inside the component) because the blocks below
 * the component — the KPI card, the chart panels — animate with the same curve.
 */
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function HistoryTab({ storeId }: Props) {
  const { lang, t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // The URL owns the dashboard state (range, filters, page), so a view is
  // shareable and the back button walks through it — same contract as Items.
  const queryString = searchParams.toString()
  const query = useMemo(() => parseHistoryQuery(new URLSearchParams(queryString)), [queryString])
  const apiQuery = useMemo(() => historyApiParams(query).toString(), [query])

  const [summary, setSummary] = useState<HistorySummary | null>(null)
  const [page, setPage] = useState<HistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [searchInput, setSearchInput] = useState(query.q)
  const [expanded, setExpanded] = useState<string | null>(null)

  const shouldReduceMotion = useReducedMotion()

  /*
   * Render choreography for the whole tab.
   *
   * Two rules, because Framer's variant propagation is shallow: a variant label
   * only reaches the children of the element that owns it, so a leaf sitting in a
   * nested container (the KPI grid, the charts grid) never receives `animate` and
   * stays at `opacity: 0` forever — which is exactly what hid the KPI row and all
   * five chart panels. Therefore:
   *   1. every animated element carries its own `initial`/`animate`, and
   *   2. the cascade comes from `reveal(slot, within)` delays, not from
   *      `staggerChildren` — `slot` is the block's place on the screen, `within`
   *      its place inside that block (a KPI in the row, a receipt in the list).
   */
  const travel = shouldReduceMotion ? 0 : 12
  const reveal = (slot: number, within = 0) =>
    shouldReduceMotion ? 0 : Math.min(slot * 0.08 + within * 0.04, 0.6)
  const rise = (wait = 0): Variants => ({
    hidden: { opacity: 0, y: travel },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: shouldReduceMotion ? 0.2 : 0.4, ease: EASE_OUT, delay: wait },
    },
  })

  /** Patch the URL — callers reset `page` whenever the result set changes. */
  const updateQuery = useCallback(
    (patch: Partial<ReturnType<typeof parseHistoryQuery>>) => {
      const next = {
        ...parseHistoryQuery(new URLSearchParams(queryString)),
        ...patch,
      }
      // Merged over the current params so foreign keys (`tab`, …) survive.
      const nextQuery = withHistoryUrlParams(new URLSearchParams(queryString), next).toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    },
    [pathname, queryString, router]
  )

  // ── Fetching ───────────────────────────────────────────────────────────────
  /*
   * Same contract as the Items tab: `stale` dims the previous page while the
   * requested one loads (the pager already points at it), and a page the server
   * had to clamp is mirrored back into the URL.
   */
  const { markLoaded, stale } = usePageSync(apiQuery, query.page, page, (next) =>
    updateQuery({ page: next })
  )

  // Two requests per view: the SQL summary that feeds the charts and one page of
  // receipts. Neither ever pulls the whole history into the browser.
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const tzOffset = tzOffsetMinutes()

    // eslint-disable-next-line react-hooks/set-state-in-effect -- request lifecycle
    setRefreshing(true)

    const request = async () => {
      const [summaryRes, listRes] = await Promise.all([
        fetch(`/api/quickstore/stores/${storeId}/history/summary?${apiQuery}&tzOffset=${tzOffset}`, {
          signal: controller.signal,
        }),
        fetch(`/api/quickstore/stores/${storeId}/history?${apiQuery}&tzOffset=${tzOffset}`, {
          signal: controller.signal,
        }),
      ])

      if (!summaryRes.ok || !listRes.ok) {
        const failed = summaryRes.ok ? listRes : summaryRes
        const payload = (await failed.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? t("Failed to load history"))
      }

      return (await Promise.all([summaryRes.json(), listRes.json()])) as [
        HistorySummary,
        HistoryPage,
      ]
    }

    request()
      .then(([summaryData, pageData]) => {
        if (!active) return
        setSummary(summaryData)
        setPage(pageData)
        // These receipts answer the request this URL asked for.
        markLoaded(apiQuery)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return
        const message =
          err instanceof Error ? serverText(lang, err.message) : t("Failed to load history")
        setError(message)
        toast.error(message)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [storeId, apiQuery, reloadToken, lang, t, markLoaded])

  // Keep the search box in sync when the URL changes elsewhere.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(query.q)
  }, [query.q])

  // Debounced receipt search — always back to page 1.
  useEffect(() => {
    if (searchInput === query.q) return
    const id = setTimeout(() => updateQuery({ q: searchInput.trim(), page: 1 }), 350)
    return () => clearTimeout(id)
  }, [searchInput, query.q, updateQuery])

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex justify-center py-12"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </motion.div>
    )
  }

  if (error || !summary || !page) {
    return (
      <motion.div
        initial={{ opacity: 0, y: travel }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.2 : 0.4, ease: EASE_OUT }}
        className="flex flex-col items-center justify-center border border-dashed border-destructive/40 bg-card px-4 py-12 text-center"
      >
        <p className="font-semibold text-destructive">{error ?? t("Failed to load history")}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setReloadToken((token) => token + 1)}
        >
          {t("Try again")}
        </Button>
      </motion.div>
    )
  }

  const money = (value: string) => formatCents(toCents(value))
  const series = fillSeries(summary.series, summary.granularity)
  const average =
    summary.totals.sales > 0
      ? formatCents(Math.round(toCents(summary.totals.revenue) / summary.totals.sales))
      : money("0")

  /** The four headline numbers, in render order — one `Kpi` card each. */
  const kpis: { id: string; label: string; value: string; meta?: string }[] = [
    { id: "history-kpi-revenue", label: t("Revenue"), value: money(summary.totals.revenue) },
    { id: "history-kpi-sales", label: t("Sales"), value: String(summary.totals.sales) },
    { id: "history-kpi-items", label: t("Items sold"), value: String(summary.totals.items) },
    {
      id: "history-kpi-average",
      label: t("Average sale"),
      value: average,
      meta: `${t("Discounts")} ${money(summary.totals.discount)}`,
    },
  ]

  const sales = page.sales
  /*
   * While the next page loads the list still shows the previous receipts, but the
   * pager already points at the page the URL asks for (never past the last known
   * page), so the click feels instant.
   */
  const shownPage = Math.min(stale ? query.page : page.page, page.totalPages)
  const from = page.total === 0 ? 0 : (shownPage - 1) * page.pageSize + 1
  const to = Math.min(shownPage * page.pageSize, page.total)
  const hasSales = summary.totals.sales > 0


  return (
    <div className="space-y-5">
      {/*
       * Range picker — mobile first: the presets scroll sideways on a phone
       * (instead of wrapping into three rows) and the custom dates sit right
       * below them, full width, which is what a thumb needs.
       */}
      <motion.div
        variants={rise(reveal(0))}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
          {HISTORY_PRESETS.map((preset) => {
            const active = query.preset === preset
            return (
              <button
                key={preset}
                type="button"
                id={`history-range-${preset}`}
                aria-pressed={active}
                onClick={() => updateQuery({ preset, page: 1 })}
                className={`shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t(PRESET_LABELS[preset])}
              </button>
            )
          })}
        </div>

        {query.preset === "custom" ? (
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <label htmlFor="history-from" className="shrink-0 text-xs text-muted-foreground">
                {t("From")}
              </label>
              <Input
                id="history-from"
                type="date"
                className="min-w-0 flex-1"
                max={query.to || undefined}
                value={query.from}
                onChange={(e) => updateQuery({ from: e.target.value, page: 1 })}
              />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <label htmlFor="history-to" className="shrink-0 text-xs text-muted-foreground">
                {t("To")}
              </label>
              <Input
                id="history-to"
                type="date"
                className="min-w-0 flex-1"
                min={query.from || undefined}
                max={new Date().toISOString().slice(0, 10)}
                value={query.to}
                onChange={(e) => updateQuery({ to: e.target.value, page: 1 })}
              />
            </div>
          </div>
        ) : (
          <p className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="min-w-0">
              {query.from
                ? `${dayLabel(query.from, lang)} – ${dayLabel(query.to, lang)}`
                : t("All recorded sales")}
            </span>
            {refreshing && <Loader2 className="size-3 shrink-0 animate-spin" />}
          </p>
        )}
      </motion.div>

      {/* KPI cards — two per row on a phone, four from `md` up. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        {kpis.map((kpi, index) => (
          <Kpi key={kpi.id} {...kpi} variants={rise(reveal(1, index))} />
        ))}
      </div>



      {!hasSales ? (
        <motion.div
          variants={rise(reveal(1))}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center justify-center border border-dashed border-border bg-card px-4 py-14 text-center"
        >
          <ReceiptIcon className="mb-3 size-8 text-muted-foreground/50" />
          <p className="font-semibold">{t("No sales in this range")}</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {t("Pick another date range or ring up a sale in the cashier.")}
          </p>
        </motion.div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Revenue trend — the headline chart, full width on every screen. */}
          <Panel
            variants={rise(reveal(2, 0))}
            id="history-panel-revenue"
            title={t("Revenue trend")}
            hint={t(
              summary.granularity === "day"
                ? "By day"
                : summary.granularity === "week"
                  ? "By week"
                  : "By month"
            )}
            className="lg:col-span-2"
          >
            <RevenueLine
              points={series}
              granularity={summary.granularity}
              lang={lang}
              emptyLabel={t("No sales in this range")}
            />
          </Panel>

          <Panel
            variants={rise(reveal(2, 1))}
            id="history-panel-hours"
            title={t("Peak hours")}
            hint={t("Revenue by hour")}
          >
            <HourStrip
              hours={summary.byHour}
              label={t("No sales in this range")}
            />
          </Panel>

          <Panel
            variants={rise(reveal(2, 2))}
            id="history-panel-top-items"
            title={t("Top items")}
            hint={t("Best sellers")}
          >
            <SliceBars
              slices={summary.topItems}
              emptyLabel={t("No sales in this range")}
              meta={(slice) => t("{count} sold", { count: slice.quantity ?? 0 })}
            />
          </Panel>

          <Panel
            variants={rise(reveal(2, 3))}
            id="history-panel-cashiers"
            title={t("Top cashiers")}
            className="lg:col-span-2"
          >
            <SliceBars
              slices={summary.byCashier}
              emptyLabel={t("No sales in this range")}
              meta={(slice) =>
                t(slice.sales === 1 ? "{count} sale" : "{count} sales", { count: slice.sales })
              }
            />
          </Panel>
        </div>
      )}

      {/* ── Transactions ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <motion.div
          variants={rise(reveal(3))}
          initial="hidden"
          animate="show"
          className="flex items-center justify-between gap-3"
        >
          <h2 className="min-w-0 truncate text-sm font-semibold">{t("Transactions")}</h2>
          {refreshing && (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          )}
        </motion.div>

        <motion.div
          variants={rise(reveal(3, 1))}
          initial="hidden"
          animate="show"
          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="history-search"
              type="search"
              className="pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("Search receipts…")}
              aria-label={t("Search receipts…")}
            />
          </div>

          <Select
            value={query.status}
            onValueChange={(value) => updateQuery({ status: value as HistoryStatus, page: 1 })}
          >
            <SelectTrigger id="history-status" className="w-full sm:w-40" aria-label={t("Status")}>
              {/*
               * The label is rendered from the value: Base UI can only read an
               * option's text while the popup is mounted, so a closed trigger
               * would otherwise fall back to the raw value ("all").
               */}
              <SelectValue>{(value) => t(STATUS_LABELS[value as HistoryStatus])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["all", "completed", "voided"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(STATUS_LABELS[value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        {sales.length === 0 ? (
          <motion.div
            variants={rise(reveal(4))}
            initial="hidden"
            animate="show"
            className="flex flex-col items-center justify-center border border-dashed border-border bg-card px-4 py-12 text-center"
          >
            <ReceiptIcon className="mb-3 size-8 text-muted-foreground/50" />
            <p className="font-semibold">{t("No receipts match")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Adjust the search, status or date range.")}
            </p>
          </motion.div>
        ) : (
          <ul
            /*
             * The list remounts with the result set (`key`), so every row replays
             * its entrance on a page / filter change instead of the rows being
             * swapped in place — and nothing replays while a receipt is expanded
             * or a refresh dims the list.
             */
            key={apiQuery}
            className={cn(
              "divide-y divide-border overflow-hidden rounded-lg border border-border bg-card transition-opacity",
              // Receipts of the previous page while the requested one loads.
              stale && "opacity-60"
            )}
            aria-busy={stale}
          >
            {sales.map((sale, index) => {
              const isOpen = expanded === sale.id

              return (
                <motion.li
                  key={sale.id}
                  variants={rise(reveal(4, index))}
                  initial="hidden"
                  animate="show"
                  data-testid={`history-sale-${sale.receiptNumber}`}
                >
                  <button
                    type="button"
                    className="flex w-full min-w-0 cursor-pointer items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:gap-3 sm:px-4"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : sale.id)}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      <ChevronDown
                        className={`size-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 truncate font-mono text-xs font-semibold">
                          {sale.receiptNumber}
                        </span>
                        {sale.status !== "completed" && (
                          <Badge variant="secondary" className="shrink-0 text-3xs uppercase">
                            {sale.status}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                        {dateTime(sale.paidAt, lang)} · {sale.cashierName ?? t("Unknown cashier")} ·{" "}
                        {t(sale.itemCount === 1 ? "{count} item" : "{count} items", {
                          count: sale.itemCount,
                        })}
                      </span>
                    </span>

                    <span className="shrink-0 text-end text-2sm font-semibold tabular-nums sm:text-sm">
                      {formatCents(toCents(sale.total))}
                    </span>
                  </button>

                  {/*
                   * The receipt detail opens by animating its own height, so the
                   * rows below slide down instead of jumping — the row entrance
                   * (`variants={rise(...)}`) is not replayed, the row never remounts.
                   */}
                  {isOpen && (
                    <motion.div
                      initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      transition={{ duration: shouldReduceMotion ? 0.15 : 0.28, ease: EASE_OUT }}
                      className="overflow-hidden border-t border-border bg-muted/20"
                    >
                      <div className="px-3 py-3 sm:px-4">
                        <ul className="space-y-1.5">
                          {sale.lines.map((line) => (
                            <li
                              key={line.id}
                              className="flex items-center justify-between gap-2 text-xs sm:gap-3"
                            >
                              <span className="min-w-0 truncate">
                                {line.name}
                                <span className="text-muted-foreground">
                                  {" · "}
                                  {line.quantity} ×{" "}
                                  {formatCents(toCents(line.unitPricePaid))}
                                  {line.discountPercent > 0 && ` (−${line.discountPercent}%)`}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums">
                                {formatCents(toCents(line.lineTotal))}
                              </span>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                          <span className="text-muted-foreground">
                            {t("Subtotal")} {formatCents(toCents(sale.subtotal))}
                            {toCents(sale.discountTotal) > 0 &&
                              ` · ${t("Discounts")} −${formatCents(toCents(sale.discountTotal))}`}
                          </span>
                          <span className="font-semibold">
                            {t("Total")} {formatCents(toCents(sale.total))}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.li>
              )
            })}
          </ul>
        )}

        {/* Pager — only worth showing once there is more than one page. */}
        {page.total > 0 && (
          <motion.div
            variants={rise(reveal(5))}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-xs text-muted-foreground">
              {t("{from}–{to} of {total}", { from, to, total: page.total })}
            </p>

            {/* Wraps instead of squeezing: at 320px the page-size box and the
                two arrows do not fit on one line with the range text. */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
              <Select
                value={String(query.pageSize)}
                onValueChange={(value) => updateQuery({ pageSize: Number(value), page: 1 })}
              >
                <SelectTrigger
                  id="history-page-size"
                  size="sm"
                  className="min-w-[7.5rem]"
                  aria-label={t("Rows per page")}
                >
                  <SelectValue>
                    {(value) => t("{count} per page", { count: value })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HISTORY_PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {t("{count} per page", { count: size })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  id="history-prev-page"
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("Previous")}
                  disabled={shownPage <= 1 || refreshing}
                  onClick={() => updateQuery({ page: shownPage - 1 })}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="px-1 text-xs tabular-nums text-muted-foreground">
                  {t("Page {page} of {pages}", { page: shownPage, pages: page.totalPages })}
                </span>
                <Button
                  id="history-next-page"
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("Next")}
                  disabled={shownPage >= page.totalPages || refreshing}
                  onClick={() => updateQuery({ page: shownPage + 1 })}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ── Small building blocks ────────────────────────────────────────────────────

function dateTime(value: string, lang: string) {
  return new Date(value).toLocaleString(lang === "ID" ? "id-ID" : undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * One headline number.
 *
 * The element owns its entrance (`initial`/`animate`): it sits in a plain grid,
 * so nothing would hand it a variant label — inheritance only reaches the
 * children of the element that declares the label.
 */
function Kpi({
  id,
  label,
  value,
  meta,
  variants,
}: {
  id: string
  label: string
  value: string
  meta?: string
  variants: Variants
}) {
  return (
    <motion.div
      id={id}
      variants={variants}
      initial="hidden"
      animate="show"
      className="min-w-0 rounded-lg border border-border bg-card p-2.5 sm:p-3"
    >
      <p className="truncate text-2xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base leading-tight font-semibold tabular-nums text-foreground sm:text-lg">
        {value}
      </p>
      {meta && <p className="mt-0.5 truncate text-3xs text-muted-foreground">{meta}</p>}
    </motion.div>
  )
}

/**
 * A chart card. Like `Kpi` it carries its own `initial`/`animate`, so the
 * entrance never depends on a parent container handing a variant down.
 */
function Panel({
  id,
  title,
  hint,
  className = "",
  variants,
  children,
}: {
  id: string
  title: string
  hint?: string
  className?: string
  variants: Variants
  children: React.ReactNode
}) {
  return (
    <motion.section
      id={id}
      variants={variants}
      initial="hidden"
      animate="show"
      className={`min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
        {hint && <span className="shrink-0 text-3xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </motion.section>
  )
}

