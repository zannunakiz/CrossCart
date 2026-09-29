/**
 * QuickStore — Demo page data + mocks.
 *
 * The `/demo` page renders the very same cashier UI (`ProductSearch`, `VoiceOrder`,
 * `SaleCart`, `ReceiptPanel`) but with **no database and no server**: the catalog
 * below is a fixed, bilingual sample and every "network" step is a `waitForDemo()`
 * delay, so a guest can try the whole flow — voice, autocomplete, receipt,
 * confirm, export — without an account or a store.
 *
 * Nothing in this module imports a server-only file: it is bundled into the demo
 * Client Component exactly like `lib/quickstore/cashier.ts`.
 *
 * The voice interpreter is a *deterministic local parser* (quantity word/digit +
 * product name) whose raw answer is then pushed through the **real**
 * `mapVoiceOrderResult`, so de-duplication, the per-line cap and the
 * "not found in this store" reporting behave exactly like the production
 * OpenRouter path — just offline.
 */
import type { StoreRole } from "@/lib/db/schema"
import {
  MAX_QTY_PER_LINE,
  computeTotals,
  fromCents,
  type CashierItem,
  type Receipt,
  type ReceiptLine,
  type SaleLine,
} from "@/lib/quickstore/cashier"
import {
  mapVoiceOrderResult,
  type VoiceCatalogItem,
  type VoiceLanguage,
  type VoiceOrderResult,
} from "@/lib/quickstore/voice-order"

// ─────────────────────────────────────────────────────────────────────────────
// Fake latency — the demo's stand-in for a real round-trip
// ─────────────────────────────────────────────────────────────────────────────

/** How long every simulated request takes (catalog read, voice, checkout). */
export const DEMO_LATENCY_MS = 1500

/** Resolve after `ms`; used to keep the real loading states on screen. */
export function waitForDemo(ms: number = DEMO_LATENCY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The demo store
// ─────────────────────────────────────────────────────────────────────────────

export interface DemoStore {
  id: string
  name: string
  description: string
  open: boolean
  /** Public asset — the demo never uploads anything. */
  paymentQr: string | null
  role: StoreRole
}

export const DEMO_STORE: DemoStore = {
  id: "demo-store",
  name: "Demo Store",
  description: "A sandbox copy of the QuickStore cashier.",
  open: true,
  paymentQr: "/Demo-QR.png",
  role: "admin",
}

/** Who "rang up" the demo sale — printed on the receipt and the PNG sheet. */
export const DEMO_CASHIER_NAME = "Demo Cashier"

// ─────────────────────────────────────────────────────────────────────────────
// The catalog
// ─────────────────────────────────────────────────────────────────────────────

/** Which half of the bilingual sample a row comes from. */
export type DemoOrigin = "ID" | "EN"

/**
 * A demo product. Structurally a `CashierItem` (so every cashier component
 * accepts it as-is) plus the two fields that only exist for the sample data.
 */
export interface DemoItem extends CashierItem {
  origin: DemoOrigin
  /** Loose grouping, e.g. `Food`, `Snack`, `Electronic`, `Household`. */
  category: string
}

/** A mutable copy: the demo reduces these stocks in memory as it sells. */
export function demoItemsSnapshot(): DemoItem[] {
  return DEMO_ITEMS.map((item) => ({ ...item }))
}

/**
 * 50 products — 25 Indonesian, 25 English — spanning food, drinks, snacks,
 * electronics, household and stationery. Names stay inside `NAME_MAX_LENGTH`
 * (20) and descriptions inside `DESCRIPTION_MAX_LENGTH` (50), exactly like the
 * real item form, and the spread of stocks / discounts / availability is
 * deliberate: unlimited (`null`) stock, low stock, out of stock and unavailable
 * rows all exist so their cart warnings can be seen.
 */
export const DEMO_ITEMS: readonly DemoItem[] = [
  // ── Indonesian half — 25 rows ─────────────────────────────────────────────
  { id: "demo-01", origin: "ID", category: "Food", name: "Nasi Goreng Spesial", description: "Nasi goreng telur, ayam, kerupuk", price: "25000.00", available: true, stocks: 24, discountPercent: 0 },
  { id: "demo-02", origin: "ID", category: "Food", name: "Mie Goreng Jawa", description: "Mie goreng manis dengan telur", price: "22000.00", available: true, stocks: 18, discountPercent: 10 },
  { id: "demo-03", origin: "ID", category: "Food", name: "Sate Ayam 10 Tusuk", description: "Sate ayam bumbu kacang + lontong", price: "35000.00", available: true, stocks: 12, discountPercent: 0 },
  { id: "demo-04", origin: "ID", category: "Food", name: "Bakso Sapi Kuah", description: "Bakso sapi 5 butir, kuah kaldu", price: "20000.00", available: true, stocks: 8, discountPercent: 0 },
  { id: "demo-05", origin: "ID", category: "Food", name: "Soto Ayam Lamongan", description: "Soto ayam dengan koya", price: "21000.00", available: true, stocks: 15, discountPercent: 5 },
  { id: "demo-06", origin: "ID", category: "Food", name: "Rendang Daging", description: "Rendang padang, porsi kecil", price: "45000.00", available: true, stocks: 6, discountPercent: 10 },
  { id: "demo-07", origin: "ID", category: "Food", name: "Gado-Gado", description: "Sayur rebus, bumbu kacang, lontong", price: "18000.00", available: true, stocks: 9, discountPercent: 0 },
  { id: "demo-08", origin: "ID", category: "Snack", name: "Martabak Manis Keju", description: "Martabak manis isi keju susu", price: "40000.00", available: true, stocks: 5, discountPercent: 15 },
  { id: "demo-09", origin: "ID", category: "Snack", name: "Pisang Goreng 5 Pcs", description: "Pisang goreng crispy, gula halus", price: "15000.00", available: true, stocks: 20, discountPercent: 0 },
  { id: "demo-10", origin: "ID", category: "Snack", name: "Tahu Isi", description: "Tahu isi sayur, cabe rawit", price: "10000.00", available: true, stocks: 30, discountPercent: 0 },
  { id: "demo-11", origin: "ID", category: "Snack", name: "Tempe Mendoan", description: "Tempe goreng tepung setengah matang", price: "12000.00", available: true, stocks: 14, discountPercent: 0 },
  { id: "demo-12", origin: "ID", category: "Snack", name: "Kerupuk Udang", description: "Kerupuk udang mentah 250 gram", price: "8000.00", available: true, stocks: 40, discountPercent: 0 },
  { id: "demo-13", origin: "ID", category: "Snack", name: "Keripik Singkong", description: "Keripik singkong balado pedas", price: "9500.00", available: true, stocks: 2, discountPercent: 0 },
  { id: "demo-14", origin: "ID", category: "Snack", name: "Kacang Atom", description: "Kacang atom kemasan 100 gram", price: "7500.00", available: true, stocks: null, discountPercent: 5 },
  { id: "demo-15", origin: "ID", category: "Drink", name: "Kopi Susu Gula Aren", description: "Es kopi susu dengan gula aren", price: "24000.00", available: true, stocks: 22, discountPercent: 10 },
  { id: "demo-16", origin: "ID", category: "Drink", name: "Es Teh Manis", description: "Teh manis dingin, gelas besar", price: "7000.00", available: true, stocks: 60, discountPercent: 0 },
  { id: "demo-17", origin: "ID", category: "Drink", name: "Es Jeruk Peras", description: "Jeruk peras segar, es batu", price: "12000.00", available: true, stocks: 25, discountPercent: 0 },
  { id: "demo-18", origin: "ID", category: "Drink", name: "Air Mineral 600ml", description: "Air mineral botol 600 ml", price: "5000.00", available: true, stocks: 100, discountPercent: 0 },
  { id: "demo-19", origin: "ID", category: "Drink", name: "Susu Kental Manis", description: "Kaleng susu kental manis 370 gram", price: "14000.00", available: true, stocks: 0, discountPercent: 0 },
  { id: "demo-20", origin: "ID", category: "Household", name: "Sambal Botol 135ml", description: "Sambal bawang botol 135 ml", price: "16500.00", available: true, stocks: 11, discountPercent: 5 },
  { id: "demo-21", origin: "ID", category: "Household", name: "Kecap Manis 275ml", description: "Kecap manis kedelai botol", price: "19000.00", available: true, stocks: 13, discountPercent: 0 },
  { id: "demo-22", origin: "ID", category: "Electronic", name: "Kipas Angin Mini", description: "Kipas angin USB, 3 tingkat", price: "85000.00", available: true, stocks: 7, discountPercent: 0 },
  { id: "demo-23", origin: "ID", category: "Electronic", name: "Lampu LED 12 Watt", description: "Lampu LED putih 12 watt", price: "32000.00", available: true, stocks: 16, discountPercent: 20 },
  { id: "demo-24", origin: "ID", category: "Electronic", name: "Power Bank 10.000", description: "Power bank 10.000 mAh fast charge", price: "165000.00", available: true, stocks: 4, discountPercent: 25 },
  { id: "demo-25", origin: "ID", category: "Electronic", name: "Kabel USB-C 1m", description: "Kabel data USB-C 1 meter", price: "28000.00", available: false, stocks: 9, discountPercent: 0 },

  // ── English half — 25 rows ────────────────────────────────────────────────
  { id: "demo-26", origin: "EN", category: "Food", name: "Chicken Rice Bowl", description: "Grilled chicken over steamed rice", price: "32000.00", available: true, stocks: 18, discountPercent: 0 },
  { id: "demo-27", origin: "EN", category: "Food", name: "Beef Burger Deluxe", description: "Beef patty, cheese, house sauce", price: "45000.00", available: true, stocks: 10, discountPercent: 10 },
  { id: "demo-28", origin: "EN", category: "Food", name: "Cheese Pizza Slice", description: "Mozzarella slice, tomato base", price: "28000.00", available: true, stocks: 12, discountPercent: 0 },
  { id: "demo-29", origin: "EN", category: "Food", name: "French Fries", description: "Shoestring fries with sea salt", price: "18000.00", available: true, stocks: 26, discountPercent: 0 },
  { id: "demo-30", origin: "EN", category: "Food", name: "Onion Rings", description: "Crispy battered onion rings", price: "20000.00", available: true, stocks: 14, discountPercent: 5 },
  { id: "demo-31", origin: "EN", category: "Drink", name: "Iced Latte", description: "Double shot espresso over milk", price: "26000.00", available: true, stocks: 30, discountPercent: 0 },
  { id: "demo-32", origin: "EN", category: "Drink", name: "Cold Brew Bottle", description: "Slow steeped cold brew 250 ml", price: "30000.00", available: true, stocks: 9, discountPercent: 0 },
  { id: "demo-33", origin: "EN", category: "Drink", name: "Green Tea", description: "Hot green tea, refillable cup", price: "15000.00", available: true, stocks: 35, discountPercent: 0 },
  { id: "demo-34", origin: "EN", category: "Drink", name: "Hot Chocolate", description: "Dark cocoa with steamed milk", price: "25000.00", available: true, stocks: 16, discountPercent: 15 },
  { id: "demo-35", origin: "EN", category: "Bakery", name: "Butter Croissant", description: "Flaky butter croissant, baked AM", price: "22000.00", available: true, stocks: 8, discountPercent: 0 },
  { id: "demo-36", origin: "EN", category: "Snack", name: "Chocolate Bar", description: "Milk chocolate bar 90 gram", price: "12000.00", available: true, stocks: 48, discountPercent: 20 },
  { id: "demo-37", origin: "EN", category: "Snack", name: "Potato Chips", description: "Sea salt potato chips 68 gram", price: "13500.00", available: true, stocks: 3, discountPercent: 0 },
  { id: "demo-38", origin: "EN", category: "Snack", name: "Chewing Gum Pack", description: "Peppermint gum, 10 pieces", price: "6000.00", available: true, stocks: 55, discountPercent: 0 },
  { id: "demo-39", origin: "EN", category: "Snack", name: "Instant Ramen Cup", description: "Spicy chicken cup noodles", price: "11000.00", available: true, stocks: 42, discountPercent: 10 },
  { id: "demo-40", origin: "EN", category: "Electronic", name: "Wireless Mouse", description: "2.4 GHz silent wireless mouse", price: "95000.00", available: true, stocks: 6, discountPercent: 30 },
  { id: "demo-41", origin: "EN", category: "Electronic", name: "USB-C Cable 1m", description: "Braided USB-C charging cable", price: "29000.00", available: true, stocks: 20, discountPercent: 0 },
  { id: "demo-42", origin: "EN", category: "Electronic", name: "Phone Stand", description: "Adjustable aluminium phone stand", price: "26000.00", available: true, stocks: 0, discountPercent: 0 },
  { id: "demo-43", origin: "EN", category: "Electronic", name: "Bluetooth Speaker", description: "Portable speaker, 8 h battery", price: "275000.00", available: true, stocks: 5, discountPercent: 15 },
  { id: "demo-44", origin: "EN", category: "Electronic", name: "Wireless Earbuds", description: "TWS earbuds with charging case", price: "320000.00", available: true, stocks: 4, discountPercent: 25 },
  { id: "demo-45", origin: "EN", category: "Electronic", name: "LED Desk Lamp", description: "Dimmable LED lamp, USB powered", price: "88000.00", available: true, stocks: 10, discountPercent: 0 },
  { id: "demo-46", origin: "EN", category: "Electronic", name: "Power Bank 20.000", description: "20.000 mAh power bank, dual port", price: "240000.00", available: true, stocks: 3, discountPercent: 20 },
  { id: "demo-47", origin: "EN", category: "Stationery", name: "Notebook A5", description: "A5 dotted notebook, 160 pages", price: "24000.00", available: true, stocks: 33, discountPercent: 0 },
  { id: "demo-48", origin: "EN", category: "Stationery", name: "Ballpoint Pen", description: "0.5 mm black ballpoint pen", price: "4500.00", available: true, stocks: null, discountPercent: 0 },
  { id: "demo-49", origin: "EN", category: "Stationery", name: "Sticky Notes Pack", description: "Three pads of yellow sticky notes", price: "17500.00", available: true, stocks: 27, discountPercent: 5 },
  { id: "demo-50", origin: "EN", category: "Household", name: "Paper Towel Roll", description: "Kitchen paper towel, 2 ply", price: "19500.00", available: false, stocks: 19, discountPercent: 0 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Voice order — a local, deterministic interpreter
// ─────────────────────────────────────────────────────────────────────────────

/** Spoken quantities the demo understands, in both languages. */
const QUANTITY_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
}

/** What separates two products inside one spoken sentence. */
const ORDER_SEPARATOR = /,|;|\+|(?:\bdan\b)|(?:\band\b)|\n/i

interface SpokenFragment {
  /** The words that produced this fragment (shown back to the cashier). */
  heard: string
  /** The product name as heard — resolved against the catalog later. */
  name: string
  quantity: number
}

/**
 * Reads one spoken sentence: `"tiga pensil, empat pena"` becomes two fragments.
 * The quantity may be a digit (`3`), a word in either language (`tiga`,
 * `three`) or a trailing `x3`; everything else is the product name. Whether that
 * name exists is *not* decided here — `mapVoiceOrderResult` owns the lookup.
 */
export function parseDemoSpokenOrder(transcript: string): SpokenFragment[] {
  return transcript
    .split(ORDER_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const tokens = part.split(/\s+/)
      let quantity = 1
      let nameTokens = tokens

      const first = tokens[0]?.toLowerCase() ?? ""
      const leadingDigits = Number.parseInt(first, 10)
      const wordQuantity = QUANTITY_WORDS[first]
      if (Number.isInteger(leadingDigits) && leadingDigits > 0) {
        quantity = leadingDigits
        nameTokens = tokens.slice(1)
      } else if (Number.isInteger(wordQuantity)) {
        quantity = wordQuantity
        nameTokens = tokens.slice(1)
      }

      // "Pensil x3" — the multiplier may also trail the name.
      const trailing = nameTokens[nameTokens.length - 1]?.toLowerCase().match(/^x(\d+)$/)
      if (trailing) {
        quantity = Number.parseInt(trailing[1], 10)
        nameTokens = nameTokens.slice(0, -1)
      }

      return {
        heard: part,
        name: nameTokens.join(" ").trim() || part,
        quantity: Math.min(Math.max(quantity, 1), MAX_QTY_PER_LINE),
      }
    })
}

/**
 * The demo's `interpretVoiceOrder`: no OpenRouter and no store — a `waitForDemo()`
 * delay, the local parser above, and then the **real** `mapVoiceOrderResult`, so
 * unknown products still travel back as `unmatched` exactly like production.
 */
export async function interpretDemoVoiceOrder(
  items: readonly CashierItem[],
  transcript: string,
  language: VoiceLanguage
): Promise<VoiceOrderResult> {
  await waitForDemo()

  const catalog: VoiceCatalogItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
  }))

  const raw = {
    items: parseDemoSpokenOrder(transcript).map((fragment) => ({
      name: fragment.name,
      quantity: fragment.quantity,
      heard: fragment.heard,
      confidence: 0.9,
    })),
    message: "",
  }

  return mapVoiceOrderResult(raw, catalog, transcript, language)
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt + stock — what the server would have done
// ─────────────────────────────────────────────────────────────────────────────

/** `DEMO-0001`, … — the number printed on the panel and on both exports. */
export function demoReceiptNumber(sequence: number): string {
  return `DEMO-${String(sequence).padStart(4, "0")}`
}

/**
 * Build the same `Receipt` shape the checkout action returns, so `ReceiptPanel`
 * — and the export buttons — cannot tell the demo from a real sale.
 */
export function buildDemoReceipt(lines: readonly SaleLine[], sequence: number): Receipt {
  const now = new Date().toISOString()
  const totals = computeTotals(lines)

  const receiptLines: ReceiptLine[] = lines.map((line, index) => ({
    id: `${demoReceiptNumber(sequence)}-${index + 1}`,
    itemId: line.itemId,
    name: line.name,
    unitPrice: fromCents(line.unitPriceCents),
    discountPercent: line.discountPercent,
    unitPricePaid: fromCents(line.unitPricePaidCents),
    quantity: line.quantity,
    lineTotal: fromCents(line.lineTotalCents),
  }))

  return {
    id: `demo-sale-${sequence}`,
    storeId: DEMO_STORE.id,
    receiptNumber: demoReceiptNumber(sequence),
    status: "completed",
    subtotal: fromCents(totals.subtotalCents),
    discountTotal: fromCents(totals.discountTotalCents),
    total: fromCents(totals.totalCents),
    itemCount: totals.itemCount,
    lineCount: totals.lineCount,
    note: null,
    cashierId: null,
    cashierName: DEMO_CASHIER_NAME,
    paidAt: now,
    createdAt: now,
    lines: receiptLines,
  }
}

/**
 * Sell the confirmed cart out of the in-memory catalog — the demo's stand-in for
 * the server reducing stock. Untracked stock (`null`) is left alone.
 */
export function sellDemoStock(
  items: readonly DemoItem[],
  lines: readonly SaleLine[]
): DemoItem[] {
  return items.map((item) => {
    const sold = lines.find((line) => line.itemId === item.id)?.quantity ?? 0
    if (sold === 0 || item.stocks == null) return item
    return { ...item, stocks: Math.max(0, item.stocks - sold) }
  })
}

