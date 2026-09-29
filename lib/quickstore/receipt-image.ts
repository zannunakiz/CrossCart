/**
 * QuickStore — receipt image (PNG) export.
 *
 * Draws one receipt on an offscreen canvas and hands back a PNG blob, so the
 * "Export PNG" button can save a shareable picture of the sale. No dependency
 * and no server round-trip: everything comes from the `Receipt` the history tab
 * already has, plus the store name published by the store page.
 *
 * The sheet is always light (white paper, dark ink) even in dark mode — it is a
 * receipt, meant to be read, printed and forwarded. It is painted twice: once on
 * a throwaway context to learn how tall it ends up, then for real on the canvas
 * sized from that measurement. Same code path, so the two passes can never
 * disagree about the layout.
 */
import { formatCents, toCents, type Receipt } from "@/lib/quickstore/cashier"

/** Logical drawing width; the PNG is this times `SCALE` for a crisp 2× render. */
const WIDTH = 460
const SCALE = 2
const PADDING = 22
/** Right-hand column the money values are aligned into. */
const AMOUNT_COLUMN = 128

const INK = "#111827"
const MUTED = "#6b7280"
const BORDER = "#e5e7eb"
const DANGER = "#b91c1c"

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Labels the sheet needs; passed in already translated by the caller. */
export interface ReceiptImageLabels {
  subtotal: string
  discounts: string
  total: string
  /** e.g. `Items sold` */
  itemsSold: string
  /** e.g. `Voided` — only printed when the sale is not completed. */
  voided: string
}

export interface ReceiptImageOptions {
  storeName: string
  labels: ReceiptImageLabels
  /** `id-ID` for Indonesian; omit to use the browser's own locale. */
  locale?: string
}

type Ctx = CanvasRenderingContext2D

function setFont(ctx: Ctx, weight: number, size: number, mono = false) {
  ctx.font = `${weight} ${size}px ${mono ? MONO : SANS}`
}

/** Longest text that fits, with an ellipsis when it had to be cut. */
function truncate(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Soft wrap, capped at `maxLines`; a dropped tail is flagged with an ellipsis. */
function wrapName(ctx: Ctx, text: string, maxWidth: number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  let dropped = false

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
      continue
    }
    if (lines.length === maxLines - 1) {
      dropped = true
      break
    }
    lines.push(current)
    current = word
  }
  if (current && lines.length < maxLines) lines.push(current)

  const fitted = lines.map((line) => truncate(ctx, line, maxWidth))
  if (dropped && fitted.length > 0) {
    fitted[fitted.length - 1] = truncate(ctx, `${fitted[fitted.length - 1]} …`, maxWidth)
  }
  return fitted
}

/** Paint the whole sheet and return its total height in logical pixels. */
function paint(ctx: Ctx, receipt: Receipt, options: ReceiptImageOptions): number {
  const { storeName, labels, locale } = options
  const money = (value: string) => formatCents(toCents(value))
  const left = PADDING
  const right = WIDTH - PADDING
  const nameWidth = WIDTH - PADDING * 2 - AMOUNT_COLUMN
  const stacked = receipt.lines.length > 1

  ctx.textBaseline = "top"
  ctx.textAlign = "left"
  ctx.fillStyle = INK
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1

  const rule = (at: number) => {
    ctx.beginPath()
    ctx.moveTo(left, at + 0.5)
    ctx.lineTo(right, at + 0.5)
    ctx.stroke()
  }

  let y = PADDING

  // ── Header: store name, receipt number, when + who ─────────────────────────
  setFont(ctx, 700, 19)
  ctx.textAlign = "center"
  ctx.fillText(truncate(ctx, storeName, WIDTH - PADDING * 2), WIDTH / 2, y)
  y += 25

  setFont(ctx, 500, 12, true)
  ctx.fillStyle = MUTED
  ctx.fillText(truncate(ctx, receipt.receiptNumber, WIDTH - PADDING * 2), WIDTH / 2, y)
  y += 17

  setFont(ctx, 400, 11)
  const stamped = new Date(receipt.paidAt).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  const meta = [stamped, receipt.cashierName].filter(Boolean).join(" · ")
  ctx.fillText(truncate(ctx, meta, WIDTH - PADDING * 2), WIDTH / 2, y)
  y += 17

  if (receipt.status !== "completed") {
    setFont(ctx, 700, 11)
    ctx.fillStyle = DANGER
    ctx.fillText(labels.voided.toUpperCase(), WIDTH / 2, y)
    ctx.fillStyle = INK
    y += 16
  }

  y += 4
  rule(y)
  y += 12

  // ── Lines: name (+ quantity / price / discount) and its amount ─────────────
  ctx.textAlign = "left"
  for (const line of receipt.lines) {
    setFont(ctx, 600, 12.5)
    ctx.fillStyle = INK
    const nameLines = wrapName(ctx, line.name, nameWidth)
    nameLines.forEach((text, index) => ctx.fillText(text, left, y + index * 14))

    ctx.textAlign = "right"
    ctx.fillText(truncate(ctx, money(line.lineTotal), AMOUNT_COLUMN), right, y)
    ctx.textAlign = "left"

    setFont(ctx, 400, 11)
    ctx.fillStyle = MUTED
    const detail =
      `${line.quantity} × ${money(line.unitPricePaid || line.unitPrice)}` +
      (line.discountPercent > 0 ? ` (−${line.discountPercent}%)` : "")
    ctx.fillText(truncate(ctx, detail, nameWidth), left, y + nameLines.length * 14)
    ctx.fillStyle = INK

    y += nameLines.length * 14 + 14 + (stacked ? 6 : 10)
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  rule(y)
  y += 11

  const sum = (label: string, value: string, strong = false) => {
    setFont(ctx, strong ? 700 : 400, strong ? 13 : 12)
    ctx.fillStyle = strong ? INK : MUTED
    ctx.fillText(label, left, y)
    ctx.fillStyle = INK
    ctx.textAlign = "right"
    ctx.fillText(money(value), right, y)
    ctx.textAlign = "left"
    y += strong ? 22 : 18
  }

  sum(labels.subtotal, receipt.subtotal)
  if (toCents(receipt.discountTotal) > 0) sum(labels.discounts, `-${receipt.discountTotal}`)
  sum(labels.total, receipt.total, true)

  // ── Footer ────────────────────────────────────────────────────────────────
  y += 2
  setFont(ctx, 400, 11)
  ctx.fillStyle = MUTED
  ctx.textAlign = "center"
  ctx.fillText(
    truncate(ctx, `${labels.itemsSold}: ${receipt.itemCount}`, WIDTH - PADDING * 2),
    WIDTH / 2,
    y
  )
  y += 14

  return Math.ceil(y + PADDING)
}

/** The receipt as a PNG blob, ready to be downloaded or shared. */
export async function renderReceiptImage(
  receipt: Receipt,
  options: ReceiptImageOptions
): Promise<Blob> {
  // Pass 1 — a throwaway context only there to measure. Drawing past its tiny
  // bitmap is harmless and `measureText` ignores the canvas size.
  const probe = document.createElement("canvas").getContext("2d")
  if (!probe) throw new Error("Canvas is not supported in this browser")
  const height = paint(probe, receipt, options)

  // Pass 2 — the real sheet, on a canvas sized from that measurement.
  const canvas = document.createElement("canvas")
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas is not supported in this browser")

  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, WIDTH, height)
  paint(ctx, receipt, options)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, WIDTH - 1, height - 1)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("Could not render the receipt image"))
    }, "image/png")
  })
}

/** Save a rendered sheet on the device. */
export function downloadReceiptImage(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}