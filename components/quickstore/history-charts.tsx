"use client"

/**
 * History dashboard charts, with a Shadcn line chart for revenue.
 *
 * Everything here is presentational (data in, pixels out) and mobile-first:
 * bars grow from a shared baseline, scroll horizontally when a range has more
 * buckets than fit, and every bar carries a native `<title>` tooltip so the
 * numbers stay reachable on touch as well as hover.
 *
 * The entrance animation is part of that contract: every bar grows out of its
 * baseline, every ranked row rises, and the delays are index-based and capped so
 * a 30-day range still lands in well under half a second.
 */
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCents, toCents } from "@/lib/quickstore/cashier"
import { dayLabel } from "@/lib/quickstore/history"

export interface ChartPoint {
  /** `YYYY-MM-DD` (day / week start) or `YYYY-MM`. */
  key: string
  revenue: string
  sales: number
}

export interface ChartSlice {
  label: string
  sales: number
  revenue: string
  quantity?: number
}

export type ChartGranularity = "day" | "week" | "month"

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

/** Entrance curve, shared with the history tab so the whole screen feels alike. */
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

const growUp: Variants = { hidden: { scaleY: 0 }, show: { scaleY: 1 } }
const growRight: Variants = { hidden: { scaleX: 0 }, show: { scaleX: 1 } }
const fadeIn: Variants = { hidden: { opacity: 0 }, show: { opacity: 1 } }
const riseIn: Variants = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }

const revealDelay = (index: number, step = 0.02, max = 0.4) => Math.min(index * step, max)
const money = (value: string) => formatCents(toCents(value))

export function bucketLabel(key: string, granularity: ChartGranularity, lang: string): string {
  if (granularity === "month") {
    const [year, month] = key.split("-").map(Number)
    if (!year || !month) return key
    return new Date(year, month - 1, 1).toLocaleDateString(lang === "ID" ? "id-ID" : undefined, {
      month: "short",
      year: "2-digit",
    })
  }
  return dayLabel(key, lang)
}

function stepKey(key: string, granularity: ChartGranularity): string {
  if (granularity === "month") {
    const [year, month] = key.split("-").map(Number)
    const next = new Date(year, month, 1)
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`
  }
  const [year, month, day] = key.split("-").map(Number)
  const next = new Date(year, month - 1, day + (granularity === "week" ? 7 : 1))
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
}

export function fillSeries(points: ChartPoint[], granularity: ChartGranularity, maxBuckets = 120): ChartPoint[] {
  if (points.length < 2) return points

  const byKey = new Map(points.map((point) => [point.key, point]))
  const filled: ChartPoint[] = []
  let cursor = points[0].key

  for (let index = 0; index < maxBuckets; index += 1) {
    filled.push(byKey.get(cursor) ?? { key: cursor, revenue: "0", sales: 0 })
    if (cursor === points[points.length - 1].key) return filled
    cursor = stepKey(cursor, granularity)
  }

  return points
}

function EmptyChart({ label }: { label: string }) {
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="flex h-32 items-center justify-center text-xs text-muted-foreground"
    >
      {label}
    </motion.div>
  )
}

const revenueChartConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
} satisfies ChartConfig

export function RevenueLine({
  points,
  granularity,
  lang,
  emptyLabel,
}: {
  points: ChartPoint[]
  granularity: ChartGranularity
  lang: string
  emptyLabel: string
}) {
  if (points.length === 0) return <EmptyChart label={emptyLabel} />

  const chartData = points.map((point) => ({
    ...point,
    label: bucketLabel(point.key, granularity, lang),
    revenue: toCents(point.revenue),
  }))

  return (
    <ChartContainer config={revenueChartConfig} className="h-48 w-full">
      <LineChart accessibilityLayer data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis hide domain={[0, "dataMax"]} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => {
                const point = payload[0]?.payload as { key?: string } | undefined
                return point?.key ? bucketLabel(point.key, granularity, lang) : ""
              }}
              formatter={(value) => money(String(Number(value) / 100))}
            />
          }
        />
        <Line dataKey="revenue" type="monotone" stroke="var(--color-revenue)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ChartContainer>
  )
}

export function HourStrip({
  hours,
  label,
}: {
  hours: { hour: number; sales: number; revenue: string }[]
  label: string
}) {
  const shouldReduceMotion = useReducedMotion()

  if (hours.length === 0) return <EmptyChart label={label} />

  const byHour = new Map(hours.map((row) => [row.hour, row]))
  const max = Math.max(...hours.map((row) => toCents(row.revenue)), 1)
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const row = byHour.get(hour) ?? { hour, sales: 0, revenue: "0" }
    return { ...row, height: toCents(row.revenue) === 0 ? 2 : Math.max(8, (toCents(row.revenue) / max) * 100) }
  })

  return (
    <div className="space-y-1">
      <div className="flex h-20 items-end gap-[3px]">
        {rows.map((row) => (
          <div
            key={row.hour}
            className="flex h-full flex-1 flex-col justify-end"
            title={`${String(row.hour).padStart(2, "0")}:00 · ${money(row.revenue)} · ${row.sales}`}
          >
            <motion.div
              variants={growUp}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="show"
              transition={{ duration: 0.45, ease: EASE_OUT, delay: revealDelay(row.hour, 0.015, 0.3) }}
              className={`w-full origin-bottom rounded-t-[3px] ${
                toCents(row.revenue) === 0 ? "bg-muted" : "bg-[var(--chart-2)]"
              }`}
              style={{ height: `${row.height}%` }}
            />
          </div>
        ))}
      </div>
      <motion.div
        variants={fadeIn}
        initial={shouldReduceMotion ? false : "hidden"}
        animate="show"
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex justify-between text-3xs text-muted-foreground"
      >
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </motion.div>
    </div>
  )
}
// Ranked slices (best sellers, cashiers)

export function SliceBars({
  slices,
  emptyLabel,
  /** Secondary metric under each bar. */
  meta,
}: {
  slices: ChartSlice[]
  emptyLabel: string
  meta?: (slice: ChartSlice) => string
}) {
  const shouldReduceMotion = useReducedMotion()

  if (slices.length === 0) return <EmptyChart label={emptyLabel} />

  const max = Math.max(...slices.map((slice) => toCents(slice.revenue)), 1)

  return (
    <ul className="space-y-2.5">
      {slices.map((slice, index) => (
        <motion.li
          key={`${slice.label}-${index}`}
          variants={riseIn}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="show"
          transition={{ duration: 0.35, ease: EASE_OUT, delay: revealDelay(index, 0.04, 0.3) }}
          className="space-y-1"
        >
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-medium text-foreground">
              {slice.label || "-"}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {money(slice.revenue)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              variants={growRight}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="show"
              transition={{ duration: 0.5, ease: EASE_OUT, delay: revealDelay(index, 0.04, 0.3) }}
              className="h-full origin-left rounded-full"
              style={{
                width: `${Math.max(4, Math.round((toCents(slice.revenue) / max) * 100))}%`,
                backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
              }}
            />
          </div>
          {meta && <p className="text-3xs text-muted-foreground">{meta(slice)}</p>}
        </motion.li>
      ))}
    </ul>
  )
}

