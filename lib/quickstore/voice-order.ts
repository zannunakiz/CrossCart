/**
 * QuickStore — Voice order interpretation (pure domain logic).
 *
 * A spoken sentence ("tiga pensil, empat pena") is turned into a strict JSON
 * order by an LLM (OpenRouter free models router). This module owns the three
 * deterministic pieces so they can be reasoned about without a network, a
 * browser or a database:
 *
 *   - `buildVoiceOrderPrompt` inputs — strict JSON-in / JSON-out system prompt
 *   - `extractJsonObject`           — defensive JSON extraction from model text
 *   - `mapVoiceOrderResult`         — validation + catalog resolution (ids only)
 *
 * The HTTP call to OpenRouter lives in the API route
 * (`app/api/quickstore/stores/[storeId]/voice/route.ts`).
 *
 * IMPORTANT: the model may never invent products. Every line it returns must
 * reference an id that exists in the store catalog; anything else is dropped
 * (and surfaced as `unmatched`) instead of being silently added to the sale.
 */
import { MAX_QTY_PER_LINE } from "@/lib/quickstore/cashier"

// ─────────────────────────────────────────────────────────────────────────────
// Language
// ─────────────────────────────────────────────────────────────────────────────

/** The only two languages the voice feature understands. */
export type VoiceLanguage = "EN" | "ID"

/** BCP-47 locales used by the browser speech-recognition engine. */
export const VOICE_SPEECH_LOCALE: Record<VoiceLanguage, string> = {
  EN: "en-US",
  ID: "id-ID",
}

/** Label shown inside the language select. */
export const VOICE_LANGUAGE_LABEL: Record<VoiceLanguage, string> = {
  EN: "English",
  ID: "Bahasa Indonesia",
}

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return value === "EN" || value === "ID"
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** The slice of a `store_items` row the interpreter is allowed to see. */
export interface VoiceCatalogItem {
  id: string
  name: string
  description?: string | null
}

/** One resolved order line (never a free-form product name). */
export interface VoiceOrderLine {
  itemId: string
  name: string
  quantity: number
  /** The words that produced this line, e.g. "tree pencil". */
  heard: string
  /** 0-1 self-reported confidence from the model. */
  confidence: number
}

/** A spoken product that could not be mapped to the catalog. */
export interface VoiceOrderUnmatched {
  heard: string
  reason: string
}

export type VoiceOrderStatus = "ok" | "undetected"

/** Successful interpretation (may still contain `unmatched` entries). */
export interface VoiceOrderResult {
  status: VoiceOrderStatus
  language: VoiceLanguage
  transcript: string
  lines: VoiceOrderLine[]
  unmatched: VoiceOrderUnmatched[]
  message: string
}

/** Failure returned by the API (network / provider / auth). */
export interface VoiceOrderFailure {
  status: "error"
  error: string
  code?: "OPENROUTER_FAILED" | "INVALID_REQUEST" | "EMPTY_TRANSCRIPT" | "NO_CATALOG"
}

export type VoiceOrderApiResponse = VoiceOrderResult | VoiceOrderFailure

/** Narrowing helper for the frontend. */
export function isVoiceOrderFailure(
  payload: VoiceOrderApiResponse | null
): payload is VoiceOrderFailure {
  return payload !== null && payload.status === "error"
}

/** Hard cap on what we forward to the model. */
export const VOICE_MAX_TRANSCRIPT_CHARS = 400


// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strict, JSON-only system prompt.
 *
 * Design notes:
 *   - The catalog travels in the *user* message (fresh per request), the rules
 *     live here so the prompt stays static and cache-friendly.
 *   - The prompt explicitly biases the model towards the catalog: automatic
 *     speech recognition produces homophones ("tree pencil" for "three pencil",
 *     "for" for "four", "pat" for "empat"), so the model must resolve the
 *     *intent* against the product list instead of taking words literally.
 *   - Anything the model is not sure about must land in `unmatched`, never in a
 *     guessed line — the frontend then shows "item undetected".
 */
export const VOICE_ORDER_SYSTEM_PROMPT = [
  "You are the CrossCart Voice Order Interpreter.",
  "You convert ONE spoken checkout sentence into a strict JSON order for ONE store.",
  "The store catalog is attached in the user message. You may ONLY order products that appear in that catalog.",
  "",
  "# INPUT",
  '{"transcript":"<what the cashier said>","language":"EN"|"ID"}',
  "",
  "# OUTPUT — output exactly ONE JSON object, nothing else",
  "{",
  '  "status": "ok" | "undetected",',
  '  "items": [',
  '    { "itemId": "<exact catalog id>", "name": "<exact catalog name>", "quantity": <integer 1-999>, "heard": "<words that produced this line>", "confidence": <0-1> }',
  "  ],",
  '  "unmatched": [ { "heard": "<words>", "reason": "<short reason>" } ],',
  '  "message": "<one short sentence in the same language as the transcript>"',
  "}",
  "",
  "# HARD RULES",
  "1. Reply with RAW JSON only. No markdown fences, no comments, no text before or after the object.",
  '2. "itemId" and "name" MUST be copied verbatim from the catalog. Never invent, translate, pluralize or rename a product.',
  '3. Use "status":"ok" only when "items" contains at least one entry. Otherwise use "status":"undetected" with "items":[] .',
  "4. Never list the same product twice: merge duplicates into one entry and sum the quantities.",
  "5. quantity must be a whole number between 1 and 999. A product without a spoken number means quantity 1. Never 0, negative, decimal or a range.",
  "6. Never output price, discount, stock, currency, totals or any other field. Only the fields shown above.",
  '7. A product the catalog does not contain goes into "unmatched" — never into "items".',
  '8. If the transcript is empty, is noise, or contains no product at all, return {"status":"undetected","items":[],"unmatched":[],"message":"<short apology>"} .',
  "",
  "# QUANTITIES AND NUMBER WORDS",
  "Understand numbers in English and Indonesian, spoken as digits or as words:",
  "one/satu/sebuah/a/an 1, two/dua 2, three/tiga 3, four/empat 4, five/lima 5, six/enam 6, seven/tujuh 7, eight/delapan 8, nine/sembilan 9, ten/sepuluh 10,",
  "eleven/sebelas 11, twelve/dua belas 12, a dozen/satu lusin/selusin 12, half a dozen/setengah lusin 6, fifteen/lima belas 15, twenty/dua puluh 20, fifty/lima puluh 50, one hundred/seratus 100.",
  "pair/pasang/sepasang means 2. few/beberapa without a number means 1.",
  "",
  "# NOISY SPEECH TRANSCRIPTS (most important)",
  "The transcript comes from automatic speech recognition: words are often wrong, merged, split or phonetically similar. You know the catalog, so recover the INTENDED catalog product — never the literal word.",
  "- Bias every interpretation towards the catalog. Pick the catalog product whose name/description is closest in SOUND and MEANING, in either language.",
  '  With catalog items "Pencil" and "Pen": "tree pencil", "three pine", "three pensil", "tri pensil" all mean 3 x Pencil; "for pen", "four pine", "pat pena" all mean 4 x Pen.',
  '  With an item like "Kopi Susu": "kopi susu", "coffee milk", "kofi susu" all map to it; with bottled water: "aqua", "air mineral", "mineral water" all map to it.',
  "- Common ASR homophones of numbers: tree = three, to/tu = two, for/pat = four, ate = eight, won/wan = one, tri = three, nam = six, sig = six.",
  "- Ignore filler, politeness and command words: please, tolong, mau, aku mau, saya mau, I want, add, tambah, tambahkan, kasih, beli, order, pesan, eh, hmm, dong, ya, kak, bos, bu, pak, for me.",
  '- Split the sentence on commas, "and", "dan", "sama", "plus", "+", "dengan" and newlines when they separate products.',
  "- The customer may mix languages in one sentence; both languages must resolve against the same catalog.",
  '- Never add a product a human could not find in the catalog. If a spoken product has no plausible catalog match, move the words to "unmatched" with a short reason instead of guessing.',
  "",
  "# EXAMPLES",
  'Catalog: [{"id":"a1","name":"Pencil"},{"id":"a2","name":"Pen"}]',
  'Input: {"transcript":"tree pencil and for pen","language":"EN"}',
  'Output: {"status":"ok","items":[{"itemId":"a1","name":"Pencil","quantity":3,"heard":"tree pencil","confidence":0.9},{"itemId":"a2","name":"Pen","quantity":4,"heard":"for pen","confidence":0.85}],"unmatched":[],"message":"3 Pencil and 4 Pen."}',
  'Catalog: [{"id":"b1","name":"Kopi Susu"},{"id":"b2","name":"Teh"}]',
  'Input: {"transcript":"tiga kopi susu, dua teh","language":"ID"}',
  'Output: {"status":"ok","items":[{"itemId":"b1","name":"Kopi Susu","quantity":3,"heard":"tiga kopi susu","confidence":0.98},{"itemId":"b2","name":"Teh","quantity":2,"heard":"dua teh","confidence":0.98}],"unmatched":[],"message":"3 Kopi Susu dan 2 Teh."}',
  'Catalog: [{"id":"c1","name":"Gula"}]',
  'Input: {"transcript":"battery phone charger","language":"EN"}',
  'Output: {"status":"undetected","items":[],"unmatched":[{"heard":"battery phone charger","reason":"no catalog product matches"}],"message":"No matching item found in this store."}',
].join("\n")

/** Hard cap on catalog size sent to the model (names are short, so 200 is plenty). */
export const VOICE_MAX_CATALOG_ITEMS = 200

/** Catalog slice handed to the model (id / name / description only). */
export function buildVoiceCatalog(catalog: readonly VoiceCatalogItem[]): VoiceCatalogItem[] {
  return catalog.slice(0, VOICE_MAX_CATALOG_ITEMS).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? null,
  }))
}

/**
 * User message: the catalog + the spoken sentence. Keeping the catalog in the
 * user turn leaves the system prompt static while the model always sees the
 * freshest product list.
 */
export function buildVoiceOrderUserMessage(
  transcript: string,
  language: VoiceLanguage,
  catalog: readonly VoiceCatalogItem[]
): string {
  return [
    "Catalog:",
    JSON.stringify(buildVoiceCatalog(catalog)),
    "",
    "Input:",
    JSON.stringify({ transcript: transcript.slice(0, VOICE_MAX_TRANSCRIPT_CHARS), language }),
    "",
    "Return the JSON object now.",
  ].join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// Defensive JSON extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pulls the first JSON object out of whatever the model returned. Free models
 * occasionally wrap the answer in ```json fences or prepend a sentence — we must
 * not crash on that, but we also never accept a partial answer.
 */
export function extractJsonObject(raw: string): unknown | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (text === "") return null

  const candidates = [text]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
    } catch {
      // try the next shape
    }
  }

  return null
}


// ─────────────────────────────────────────────────────────────────────────────
// Validation / catalog resolution
// ─────────────────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback
}

/** Loose comparison key: lowercase, letters + digits only. */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Quantity coming from an LLM: clamp to an integer inside 1..MAX_QTY_PER_LINE. */
export function normalizeQuantity(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.replace(",", "."))
        : Number.NaN

  if (!Number.isFinite(numeric)) return 1
  const rounded = Math.round(numeric)
  if (rounded < 1) return 1
  return Math.min(rounded, MAX_QTY_PER_LINE)
}

/** Confidence coming from an LLM: clamp to 0..1 (default 0.5 when unusable). */
function normalizeConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(numeric)) return 0.5
  return Math.min(Math.max(numeric, 0), 1)
}

/**
 * Resolve a model reference to a real catalog row.
 * Exact id first (the contract), then a loose name match as a safety net.
 */
export function resolveCatalogItem(
  reference: { itemId?: unknown; name?: unknown },
  catalog: readonly VoiceCatalogItem[]
): VoiceCatalogItem | null {
  const itemId = asString(reference.itemId)
  if (itemId) {
    const byId = catalog.find((item) => item.id.toLowerCase() === itemId.toLowerCase())
    if (byId) return byId
  }

  const name = asString(reference.name)
  if (!name) return null

  const key = normalizeKey(name)
  if (!key) return null

  const exact = catalog.find((item) => normalizeKey(item.name) === key)
  if (exact) return exact

  // Containment fallback ("Pencil HB" spoken as "pencil").
  return (
    catalog.find((item) => {
      const itemKey = normalizeKey(item.name)
      return itemKey.length >= 3 && (itemKey.includes(key) || key.includes(itemKey))
    }) ?? null
  )
}

/**
 * Turns raw model output into a validated result.
 *
 * Anything the model produced that cannot be tied to a real catalog row is
 * dropped from `lines` and reported through `unmatched`, so a hallucinated
 * product can never reach the receipt.
 */
export function mapVoiceOrderResult(
  raw: unknown,
  catalog: readonly VoiceCatalogItem[],
  transcript: string,
  language: VoiceLanguage
): VoiceOrderResult {
  const source = asRecord(raw)
  const unmatched: VoiceOrderUnmatched[] = []
  const lines: VoiceOrderLine[] = []
  const seen = new Map<string, VoiceOrderLine>()

  const rawItems = Array.isArray(source.items) ? source.items : []
  for (const entry of rawItems) {
    const record = asRecord(entry)
    const heard = asString(record.heard) || asString(record.name) || transcript
    const item = resolveCatalogItem(record, catalog)

    if (!item) {
      unmatched.push({ heard, reason: "not found in this store's catalog" })
      continue
    }

    const quantity = normalizeQuantity(record.quantity)
    const confidence = normalizeConfidence(record.confidence)
    const existing = seen.get(item.id)

    if (existing) {
      // Defensive de-duplication (the prompt already asks for merged lines).
      existing.quantity = Math.min(existing.quantity + quantity, MAX_QTY_PER_LINE)
      existing.confidence = Math.max(existing.confidence, confidence)
      continue
    }

    const line: VoiceOrderLine = {
      itemId: item.id,
      name: item.name,
      quantity,
      heard,
      confidence,
    }
    seen.set(item.id, line)
    lines.push(line)
  }

  const rawUnmatched = Array.isArray(source.unmatched) ? source.unmatched : []
  for (const entry of rawUnmatched) {
    const record = asRecord(entry)
    const heard = asString(record.heard) || asString(record.message)
    if (!heard) continue
    unmatched.push({
      heard,
      reason: asString(record.reason) || "not found in this store's catalog",
    })
  }

  // Trust the data, not the model's own status field.
  const status: VoiceOrderStatus = lines.length > 0 ? "ok" : "undetected"
  const message =
    asString(source.message) || (status === "ok" ? "" : "No matching item was detected in this store.")

  return {
    status,
    language,
    transcript,
    lines,
    // Keep the panel readable even when a chatty model returns many misses.
    unmatched: unmatched.slice(0, 5),
    message: message.slice(0, 160),
  }
}
