/**
 * QuickStore — Voice order interpretation (pure domain logic).
 *
 * A spoken sentence ("tiga pensil, empat pena", "beli 2 sate dan satu soto",
 * "fred rise dua sama roll") is turned into a strict JSON order by an LLM
 * (OpenRouter free models router). This module owns the deterministic pieces so
 * they can be reasoned about without a network, a browser or a database:
 *
 *   - `VOICE_ORDER_SYSTEM_PROMPT` — strict JSON-in / JSON-out instructions
 *   - `extractJsonObject`         — defensive JSON extraction from model text
 *   - `translatePhrase`           — glossary expansion (translation / slang)
 *   - `readSpokenQuantity`        — "dua", "nam", "x3", "5" → 2 / 6 / 3 / 5
 *   - `resolveCatalogItem`        — exact → containment → assumption resolution
 *   - `mapVoiceOrderResult`       — validation, rescue, de-duplication, clamping
 *
 * The HTTP call to OpenRouter lives in the `interpretVoiceOrder` Server Action
 * (see `lib/actions/voice-actions.ts`).
 *
 * IMPORTANT: the model may never invent products. Every line it returns must
 * reference a row that exists in the store catalog — an id it made up is dropped
 * and, before a product is written off as `unmatched`, the phrase gets one
 * deterministic last chance (`resolveCatalogItem`), because the cashier asked for
 * it and "not in this store" is a worse answer than a low-confidence best guess.
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
 *   - Recall over precision: the sentence is read as a whole (never split by
 *     connectors), one word is enough to name a product, translations, slang and
 *     abbreviations are expanded first, and `unmatched` is the LAST resort — a
 *     best-effort catalog row with a lower confidence is the better answer,
 *     because a cashier can always drop a line but never gets back a product the
 *     panel never showed. (The old wording asked the model to give up instead,
 *     which is what produced "Not in this store: beli 2 sate".)
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
  '    { "itemId": "<exact catalog id>", "name": "<exact catalog name>", "quantity": <integer 1-999>, "heard": "<product words + its number>", "confidence": <0-1> }',
  "  ],",
  '  "unmatched": [ { "heard": "<product words>", "reason": "<short reason>" } ],',
  '  "message": "<one short sentence in the same language as the transcript>"',
  "}",
  "",
  "# HARD RULES",
  "1. Reply with RAW JSON only. No markdown fences, no comments, no text before or after the object.",
  '2. "itemId" and "name" MUST be copied verbatim from the catalog — never invent a product and never send the spoken wording back as the name. That rule is about the OUTPUT only: while MATCHING, a plural, a singular, a different tense, case, hyphen or a small typo is the SAME product (see "WORD FORMS").',
  '3. Use "status":"ok" only when "items" contains at least one entry. Otherwise use "status":"undetected" with "items":[] .',
  "4. Never list the same product twice: merge duplicates into one entry and sum the quantities.",
  "5. quantity must be a whole number between 1 and 999. A product without a spoken number means quantity 1. Never 0, negative, decimal or a range.",
  "6. Never output price, discount, stock, currency, totals or any other field. Only the fields shown above.",
  '7. "heard" holds ONLY the product words and their number — never the command, greeting or filler words.',
  '8. "unmatched" is the LAST RESORT. If any catalog product is a plausible reading of what was said, put it in "items" with a lower confidence instead of dropping it.',
  '9. If the transcript is empty, is noise, or contains no product at all, return {"status":"undetected","items":[],"unmatched":[],"message":"<short apology>"} .',
  "",
  "# HOW TO READ THE SENTENCE (read all of it, do not cut it up first)",
  'Never split the sentence on commas, "and"/"dan"/"sama", "plus" or filler. Walk the WHOLE sentence, find every product mentioned anywhere inside it, in any order, and link each product to the number spoken closest to it (before OR after the name).',
  '- "Beli 2 sate dan satu soto" means 2 x <the sate row> and 1 x <the soto row> — "beli" and "dan" belong to no product.',
  '- "Beli 5 pena tujuh pencil kemarin saya makan eskrim dua" means 5 x <pen>, 7 x <pencil> and 2 x <the ice-cream row> — "kemarin" and "saya makan" are context, not products.',
  "- A number that sits next to no product is ignored and never becomes a product.",
  "- Ignore greeting, politeness, command, time and verb noise everywhere: please, tolong, beli, order, pesan, tambah, tambahkan, kasih, minta, mau, aku mau, saya mau, I want, add, eh, hmm, dong, ya, kak, bos, bu, pak, for me, kemarin, tadi, besok, saya makan.",
  "",
  "# QUANTITIES AND NUMBER WORDS",
  "Understand numbers in English and Indonesian, spoken as digits or as words:",
  "one/satu/sebuah/a/an 1, two/dua 2, three/tiga 3, four/empat 4, five/lima 5, six/enam 6, seven/tujuh 7, eight/delapan 8, nine/sembilan 9, ten/sepuluh 10,",
  "eleven/sebelas 11, twelve/dua belas 12, a dozen/satu lusin/selusin 12, half a dozen/setengah lusin 6, fifteen/lima belas 15, twenty/dua puluh 20, fifty/lima puluh 50, one hundred/seratus 100.",
  "pair/pasang/sepasang means 2. few/beberapa without a number means 1.",
  "",
  "# MINIMUM INFORMATION AND PARTIAL NAMES",
  "One word is enough. When the speaker only says a slice of a name, take the catalog row that carries that slice — never drop it.",
  '- With "Paper Towel Roll": "roll" is that row. With "Ballpoint Pen": "pen" is that row. With "Es Teh Manis": "teh" is that row.',
  "- A short spoken phrase points at the most specific catalog row containing it; prefer a name that ends with the spoken words.",
  "",
  "# WORD FORMS, PLURALS AND TYPOS (grammar is never a reason to give up)",
  'A product whose words differ from the catalog only by plural/singular, tense, case, hyphens, spacing or a small typo IS that catalog product. Never move it to "unmatched" for a grammar difference.',
  '- Store has "Ballpoint Pen": "pen", "pens", "the pens", "pulpen", "pena", "balpoint pen" → all that row. Store has "Pencil": "pencil", "pencils", "pensil" → that row.',
  '- Store has "Paper Towel Roll": "roll", "rolls", "towel" → that row. Store has "Potato Chips": "potato", "potatoes", "chips", "kentang goreng" → that row.',
  '- Store has "Notebook A5": "book", "books", "notebook", "buku tulis" → that row.',
  '- "2 potato to 3 pens and a book" → 2 x the potato row, 3 x the pen row, 1 x the book row.',
  "",
  "# TRANSLATION AND PHONETIC RECOVERY",
  "Speech recognition writes what it HEARS and the speaker may use the other language entirely. Repair and translate before matching — the same real product keeps its meaning across languages:",
  "fried rice = nasi goreng | fried noodle = mie goreng | ice cream = es krim | potato = kentang | tofu = tahu | rice = nasi | noodle = mie | egg = telur | chicken = ayam | beef = sapi | fish = ikan | milk = susu | tea = teh | coffee = kopi | sugar = gula | mineral water = air mineral | pencil = pensil | pen = pena/pulpen | onion = bawang | paper towel = tisu | bread = roti | salt = garam | chili = cabe/sambal.",
  '- "fred rise", "fried rice" and "fride rise" all mean the fried-rice row of the catalog: if that row is "Nasi Goreng Rendang", then that is the row.',
  "",
  "# SLANG, ACRONYMS AND UNITS",
  "Shorthand and street slang stand in for full product names — expand them, then match:",
  '- "piscok" = pisang coklat, so "nam tau sama beli piscok" means 6 x <the tahu row> and 1 x <the pisang coklat row> ("nam" is enam = 6).',
  '- "eskrim" = es krim, "migor" = mie goreng, "tau" and "tahu" are the same word, "aqua" = air mineral, "kresek" = kantong plastik.',
  "- Units are never products: pcs, piece, pack, pax, biji, buah, butir, tusuk, gelas, botol, box, lusin, kg, gram, ml, liter.",
  "",
  "# NOISY SPEECH TRANSCRIPTS (applies to everything)",
  "Words may be merged, split, misspelled or phonetically similar, and the speaker may mix languages inside one sentence. Bias EVERY interpretation towards the catalog: pick the product whose name/description is closest in SOUND and MEANING, in either language. Never take a word literally when a catalog row explains what was meant.",
  'With catalog rows "Pencil" and "Ballpoint Pen": "tree pencil", "three pine", "three pensil", "tri pensil" all mean 3 x Pencil; "for pen", "four pine", "pat pena" all mean 4 x Ballpoint Pen.',
  'With a row like "Kopi Susu": "kopi susu", "coffee milk", "kofi susu" all map to it; with bottled water: "aqua", "air mineral", "mineral water" all map to it.',
  "Numbers may also arrive as homophones: tree/tri = three, for/pat = four, ate = eight, won/wan = one, nam = six, sig = six, tu = two.",
  'Careful with the glue words "to", "too", "tu" and "for": they are usually NOT numbers. "one potato to three pens" means 1 potato and 3 pens, not 2 of anything. Treat them as a number only when the sentence clearly counts a product and no other number is spoken ("for pen" → 4 pens), otherwise ignore them.',
  'A product with no number beside it is quantity 1, and one sentence usually mixes both ("five pens and a book" → 5 x the pen row, 1 x the book row).',
  "- Only when nothing in the catalog can be read as the spoken product, move those words to \"unmatched\" with a short reason.",
  "",
  "# EXAMPLES",
  'Catalog: [{"id":"a1","name":"Ballpoint Pen"},{"id":"a2","name":"Pencil"}]',
  'Input: {"transcript":"tree pencil and for pen","language":"EN"}',
  'Output: {"status":"ok","items":[{"itemId":"a2","name":"Pencil","quantity":3,"heard":"tree pencil","confidence":0.9},{"itemId":"a1","name":"Ballpoint Pen","quantity":4,"heard":"for pen","confidence":0.85}],"unmatched":[],"message":"3 Pencil and 4 Ballpoint Pen."}',
  'Catalog: [{"id":"b1","name":"Sate Ayam 10 Tusuk"},{"id":"b2","name":"Soto Ayam Lamongan"}]',
  'Input: {"transcript":"Beli 2 sate dan satu soto","language":"ID"}',
  'Output: {"status":"ok","items":[{"itemId":"b1","name":"Sate Ayam 10 Tusuk","quantity":2,"heard":"2 sate","confidence":0.95},{"itemId":"b2","name":"Soto Ayam Lamongan","quantity":1,"heard":"satu soto","confidence":0.95}],"unmatched":[],"message":"2 Sate Ayam 10 Tusuk dan 1 Soto Ayam Lamongan."}',
  'Catalog: [{"id":"f1","name":"Potato Chips"},{"id":"f2","name":"Ballpoint Pen"},{"id":"f3","name":"Notebook A5"}]',
  'Input: {"transcript":"One potato to three pens and book.","language":"EN"}',
  'Output: {"status":"ok","items":[{"itemId":"f1","name":"Potato Chips","quantity":1,"heard":"One potato","confidence":0.9},{"itemId":"f2","name":"Ballpoint Pen","quantity":3,"heard":"three pens","confidence":0.9},{"itemId":"f3","name":"Notebook A5","quantity":1,"heard":"book","confidence":0.7}],"unmatched":[],"message":"1 Potato Chips, 3 Ballpoint Pen, 1 Notebook A5."}',
  'Catalog: [{"id":"c1","name":"Nasi Goreng Rendang"},{"id":"c2","name":"Es Krim Vanila"},{"id":"c3","name":"Paper Towel Roll"}]',
  'Input: {"transcript":"fred rise sama dua eskrim dan satu roll","language":"ID"}',
  'Output: {"status":"ok","items":[{"itemId":"c1","name":"Nasi Goreng Rendang","quantity":1,"heard":"fred rise","confidence":0.7},{"itemId":"c2","name":"Es Krim Vanila","quantity":2,"heard":"dua eskrim","confidence":0.8},{"itemId":"c3","name":"Paper Towel Roll","quantity":1,"heard":"roll","confidence":0.8}],"unmatched":[],"message":"1 Nasi Goreng Rendang, 2 Es Krim Vanila, 1 Paper Towel Roll."}',
  'Catalog: [{"id":"d1","name":"Tahu Isi"},{"id":"d2","name":"Pisang Coklat"}]',
  'Input: {"transcript":"nam tau sama beli piscok","language":"ID"}',
  'Output: {"status":"ok","items":[{"itemId":"d1","name":"Tahu Isi","quantity":6,"heard":"nam tau","confidence":0.75},{"itemId":"d2","name":"Pisang Coklat","quantity":1,"heard":"piscok","confidence":0.8}],"unmatched":[],"message":"6 Tahu Isi dan 1 Pisang Coklat."}',
  'Catalog: [{"id":"e1","name":"Gula"}]',
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
 * Words that carry no product identity, so they are dropped before comparing:
 * grammar glue plus the greeting / command / time noise spoken around an order
 * ("beli 2 sate" is about sate, not about "beli").
 *
 * The same list is applied to the spoken words *and* to the catalog names, so
 * dropping a word can never break a product that is named after it.
 */
const FILLER_WORDS = new Set([
  "dan",
  "and",
  "the",
  "of",
  "with",
  "plus",
  "yang",
  "nya",
  "untuk",
  "buat",
  "sama",
  "beli",
  "beliin",
  "order",
  "pesan",
  "tambah",
  "tambahkan",
  "kasih",
  "minta",
  "mau",
  "aku",
  "saya",
  "kita",
  "please",
  "tolong",
  "dong",
  "kak",
  "bos",
  "pak",
  "bu",
  "ya",
  "eh",
  "hmm",
  "for",
  "me",
  "i",
  "want",
  "add",
  "kemarin",
  "tadi",
  "besok",
  "hari",
  "saja",
  "aja",
  "juga",
  "itu",
])

/**
 * Numbers and units say HOW MANY of a product, never WHICH product, so they are
 * dropped too — "nam tau" is "6 x tahu", and "enam" must not water down the match
 * against "Tahu Isi".
 */
const NUMBER_WORDS = new Set([
  "a",
  "an",
  "sebuah",
  "one",
  "won",
  "wan",
  "two",
  "to",
  "too",
  "three",
  "tree",
  "tri",
  "four",
  "five",
  "six",
  "nam",
  "sig",
  "seven",
  "eight",
  "ate",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "fifteen",
  "twenty",
  "thirty",
  "fifty",
  "hundred",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
  "belas",
  "puluh",
  "seratus",
  "lusin",
  "selusin",
  "setengah",
  "pasang",
  "sepasang",
  "dozen",
  "pcs",
  "pc",
  "piece",
  "pieces",
  "pack",
  "packs",
  "pax",
  "unit",
  "units",
  "box",
  "dos",
  "biji",
  "buah",
  "butir",
  "tusuk",
  "gelas",
  "botol",
  "kg",
  "gram",
  "ml",
  "liter",
])

/** "3", "x3" — a digit quantity, with or without the multiplier sign. */
const DIGIT_QUANTITY = /^x?(\d+)$/

/** Spoken number words, English and Indonesian (homophones included). */
const SPOKEN_QUANTITY: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  satu: 1,
  sebuah: 1,
  two: 2,
  dua: 2,
  to: 2,
  too: 2,
  three: 3,
  tiga: 3,
  tree: 3,
  tri: 3,
  four: 4,
  empat: 4,
  for: 4,
  pat: 4,
  five: 5,
  lima: 5,
  six: 6,
  enam: 6,
  nam: 6,
  sig: 6,
  seven: 7,
  tujuh: 7,
  eight: 8,
  delapan: 8,
  ate: 8,
  nine: 9,
  sembilan: 9,
  ten: 10,
  sepuluh: 10,
  eleven: 11,
  sebelas: 11,
  twelve: 12,
  "dua belas": 12,
  "tiga belas": 13,
  "empat belas": 14,
  selusin: 12,
  lusin: 12,
  "setengah lusin": 6,
  fifteen: 15,
  "lima belas": 15,
  twenty: 20,
  "dua puluh": 20,
  fifty: 50,
  "lima puluh": 50,
  hundred: 100,
  seratus: 100,
}

/** Is this token a spoken quantity ("dua", "pcs", "x3") rather than a product word? */
function isQuantityToken(token: string): boolean {
  return DIGIT_QUANTITY.test(token) || NUMBER_WORDS.has(token) || token in SPOKEN_QUANTITY
}

/** A spoken quantity is a whole number of units, never absurd. */
function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1
  const rounded = Math.round(value)
  if (rounded < 1) return 1
  return Math.min(rounded, MAX_QTY_PER_LINE)
}

/**
 * The quantity spoken in a phrase, in either language: "dua eskrim" → 2,
 * "tiga pensil" → 3, "Pensil x3" → 3, "5 pena" → 5. Falls back to `fallback`
 * (1) when no number was said — a product without a number means one.
 */
export function readSpokenQuantity(spoken: string, fallback = 1): number {
  const tokens = spoken.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

  for (let index = 0; index < tokens.length; index += 1) {
    const digits = DIGIT_QUANTITY.exec(tokens[index])
    if (digits) return clampQuantity(Number.parseInt(digits[1], 10))

    const next = tokens[index + 1]
    const pair = next ? `${tokens[index]} ${next}` : ""
    if (pair !== "" && SPOKEN_QUANTITY[pair] !== undefined) {
      return clampQuantity(SPOKEN_QUANTITY[pair])
    }

    const single = SPOKEN_QUANTITY[tokens[index]]
    if (single !== undefined) return clampQuantity(single)
  }

  return clampQuantity(fallback)
}

/** The same phrase without its quantity words ("beli 2 sate" → "beli sate"). */
export function stripSpokenQuantity(spoken: string): string {
  return spoken
    .split(/\s+/)
    .filter((token) => !isQuantityToken(token.toLowerCase()))
    .join(" ")
    .trim()
}

/** Levenshtein distance between two short words (two rolling rows). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a === "" || b === "") return a.length + b.length

  const previous: number[] = []
  for (let j = 0; j <= b.length; j += 1) previous.push(j)

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current.push(Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost))
    }
    previous.length = 0
    previous.push(...current)
  }

  return previous[b.length]
}

/** "pens" → "pen", "rolls" → "roll", "books" → "book" (never below three letters). */
function stripPlural(word: string): string {
  if (word.length < 4 || !word.endsWith("s")) return word
  const singular = word.slice(0, -1)
  return singular.length >= 3 ? singular : word
}

/**
 * How well one spoken word explains one catalog word:
 *   1.00 the same word                      ("pen" → "pen")
 *   0.90 the same word, plural or not       ("pens" → "pen", "potatoes" → "potato")
 *   0.85 one or two edits away              ("mi" → "mie", "fred" → "fried", typos)
 *   0.60 one is only a prefix of the other  ("goreng" → "gorengan", "pen" → "pencil")
 *   0.00 unrelated
 *
 * The graded score decides between rows that both "match": the row whose own word
 * was heard exactly ("Ballpoint Pen" for "pens") must beat a row the spoken word
 * is merely a prefix of ("Pencil") — a plain boolean used to hide that difference.
 */
function wordScore(spokenWord: string, catalogWord: string): number {
  if (spokenWord === catalogWord) return 1
  if (stripPlural(spokenWord) === stripPlural(catalogWord)) return 0.9

  const tolerance = Math.max(spokenWord.length, catalogWord.length) <= 4 ? 1 : 2
  if (Math.abs(spokenWord.length - catalogWord.length) <= tolerance) {
    if (editDistance(spokenWord, catalogWord) <= tolerance) return 0.85
  }

  // Prefixes: "goreng" for "gorengan", "coklat" for "cokelat".
  if (
    (spokenWord.length >= 3 && catalogWord.startsWith(spokenWord)) ||
    (catalogWord.length >= 3 && spokenWord.startsWith(catalogWord))
  ) {
    return 0.6
  }

  return 0
}

/** Do these two words mean the same product word? (Exact, plural, typo or prefix.) */
function sameWord(spokenWord: string, catalogWord: string): boolean {
  return wordScore(spokenWord, catalogWord) > 0
}

/** The words of a name, lower-cased — filler, numbers and units mean nothing. */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "" && !FILLER_WORDS.has(word) && !isQuantityToken(word))
}

// ─────────────────────────────────────────────────────────────────────────────
// Bilingual glossary — translation, slang and abbreviation recovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groups of interchangeable ways to say ONE real product, in either language:
 * translations ("fried rice" = "nasi goreng"), abbreviations ("piscok") and
 * synonyms. A spoken word from a group counts as a match for any other member,
 * so a translated or slangy sentence still lands on the store's own wording.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["fried rice", "nasi goreng"],
  ["fried noodle", "mie goreng", "migor"],
  ["ice cream", "es krim", "eskrim"],
  ["paper towel", "tissue", "tisu"],
  ["tofu", "tahu"],
  ["pencil", "pensil"],
  ["pen", "pena", "pulpen", "ballpoint"],
  ["potato", "kentang"],
  ["rice", "nasi"],
  ["noodle", "mie", "mi", "bihun"],
  ["chicken", "ayam"],
  ["beef", "sapi", "daging"],
  ["fish", "ikan"],
  ["meatball", "bakso"],
  ["skewer", "sate"],
  ["soup", "soto", "sup"],
  ["egg", "telur"],
  ["banana", "pisang"],
  ["pisang coklat", "piscok"],
  ["chocolate", "coklat", "cokelat"],
  ["bread", "roti"],
  ["flour", "tepung"],
  ["sugar", "gula"],
  ["salt", "garam"],
  ["oil", "minyak"],
  ["chili", "cabe", "cabai", "sambal"],
  ["onion", "bawang"],
  ["cracker", "kerupuk", "krupuk"],
  ["chip", "chips", "keripik"],
  ["milk", "susu"],
  ["tea", "teh"],
  ["coffee", "kopi"],
  ["water", "air mineral", "aqua"],
  ["soap", "sabun"],
  ["shampoo", "sampo"],
  ["battery", "baterai"],
  ["cable", "kabel"],
  ["lamp", "lampu"],
  ["fan", "kipas"],
  ["book", "buku"],
  ["notebook", "buku tulis"],
  ["bag", "tas"],
  ["cigarette", "rokok"],
]

/** alias → the groups that contain it (an alias may bridge two groups). */
const ALIAS_GROUPS = new Map<string, string[][]>()
for (const group of SYNONYM_GROUPS) {
  for (const alias of group) {
    const groups = ALIAS_GROUPS.get(alias) ?? []
    groups.push(group.slice())
    ALIAS_GROUPS.set(alias, groups)
  }
}

/** Every word that can stand for the same thing as `alias` (including itself). */
function synonymsOf(alias: string): string[] {
  const groups = ALIAS_GROUPS.get(alias)
  if (!groups) return [alias]

  const synonyms = new Set<string>([alias])
  for (const group of groups) for (const member of group) synonyms.add(member)
  return Array.from(synonyms)
}

/**
 * The glossary alias that matches `phrase` best — an exact alias first, then the
 * one whose words explain the spoken words most closely.
 *
 * "Best" matters: "pens" is 0.9 close to "pen" (just a plural) but only 0.85 close
 * to "pensil", so a plural must never land on the wrong group just because that
 * group happens to be declared earlier.
 */
function fuzzyAlias(phrase: string): string | null {
  if (ALIAS_GROUPS.has(phrase)) return phrase

  const spoken = phrase.split(" ")
  let best: string | null = null
  let bestScore = 0

  for (const alias of Array.from(ALIAS_GROUPS.keys())) {
    const aliasWords = alias.split(" ")
    if (aliasWords.length !== spoken.length) continue

    let score = 0
    for (let index = 0; index < aliasWords.length; index += 1) {
      const word = wordScore(spoken[index], aliasWords[index])
      if (word === 0) {
        score = 0
        break
      }
      score += word
    }

    if (score > bestScore) {
      best = alias
      bestScore = score
    }
  }

  return best
}

/**
 * How a spoken phrase could have been meant on the catalog side: the phrase
 * itself plus every translation / expansion the glossary knows
 * ("fred rise" → "fried rice" → "nasi goreng", "nam tau" → "enam tau",
 * "piscok" → "pisang coklat"). Longest alias wins and the variant count is
 * bounded, so matching stays cheap.
 */
export function translatePhrase(spoken: string, maxVariants = 6): string[] {
  const phrase = spoken.trim()
  const variants = new Set<string>([phrase])
  if (phrase === "") return Array.from(variants)

  const tokens = phrase.toLowerCase().split(/\s+/).filter(Boolean)

  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const alias = fuzzyAlias(tokens.slice(start, start + size).join(" "))
      if (!alias) continue

      for (const synonym of synonymsOf(alias)) {
        variants.add(
          tokens
            .slice(0, start)
            .concat(synonym.split(" "), tokens.slice(start + size))
            .join(" ")
        )
        if (variants.size >= maxVariants) return Array.from(variants)
      }
    }
  }

  return Array.from(variants)
}

/** Is `a` a better match than `b`? Both arrays are ranked from front to back. */
function ranksHigher(a: readonly number[], b: readonly number[]): boolean {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index]
  }
  return false
}

/**
 * The assumption pass — the last resort before a spoken product is written off as
 * "not in this store", so a name the speaker shortened, translated, abbreviated or
 * the engine misheard ("mi jawa" → "Mie Goreng Jawa", "susu" → "Susu Kental Manis",
 * "fred rise" → "Nasi Goreng", "piscok" → "Pisang Coklat", "roll" → "Paper Towel
 * Roll") still lands on a real row instead of being dropped.
 *
 * The phrase is scored as spoken *and* through every glossary expansion of it
 * (`translatePhrase`). For each variant every heard word has to land on a
 * *different* word of the product name (exactly, one or two edits away, or as a
 * prefix of it) and at least 60% of them must. Candidates are ranked by how much of
 * what was heard they explain, then by whether their own first word was heard, then
 * by how few extra words their name carries, and finally by catalog order.
 *
 * Returns null when nothing is close enough: no product was said, and inventing
 * one would put the wrong thing on a receipt.
 */
export function assumeCatalogItem<T extends { id: string; name: string }>(
  spoken: string,
  catalog: readonly T[]
): T | null {
  let best: { item: T; score: number[] } | null = null

  for (const variant of translatePhrase(spoken)) {
    best = bestAssumption(variant, catalog, best)
  }

  return best === null ? null : best.item
}

/**
 * Scores ONE spoken variant against the catalog and keeps the best rank seen so
 * far (the caller feeds it every glossary variant of the same phrase).
 */
function bestAssumption<T extends { id: string; name: string }>(
  spoken: string,
  catalog: readonly T[],
  best: { item: T; score: number[] } | null
): { item: T; score: number[] } | null {
  const heard = words(spoken)
  if (heard.length === 0) return best

  let winner = best

  for (const item of catalog) {
    const nameWords = words(item.name)
    if (nameWords.length === 0) continue

    const remaining = nameWords.slice()
    let matched = 0
    let quality = 0
    for (const word of heard) {
      const index = remaining.findIndex((candidate) => sameWord(word, candidate))
      if (index === -1) continue
      quality += wordScore(word, remaining[index])
      remaining.splice(index, 1)
      matched += 1
    }

    const coverage = matched / heard.length
    // Half a phrase right is noise, not a product.
    if (matched === 0 || coverage < 0.6) continue

    const score = [
      coverage,
      // How well the words themselves matched: "pens" explains "Pen" (1.0) far
      // better than it explains "Pencil" (0.6, only a prefix).
      quality / heard.length,
      sameWord(heard[0], nameWords[0]) ? 1 : 0,
      matched / nameWords.length,
      -nameWords.length,
    ]
    if (winner === null || ranksHigher(score, winner.score)) winner = { item, score }
  }

  return winner
}

/** How well one normalized key sits inside one catalog name: exact > end > start > inside. */
function containmentRank(key: string, itemKey: string): number {
  if (itemKey === key) return 4
  if (itemKey.endsWith(key)) return 3
  if (itemKey.startsWith(key)) return 2
  if (itemKey.includes(key)) return 1
  if (key.includes(itemKey)) return 0
  return -1
}

/**
 * The most specific catalog row whose name carries `key` ("roll" → "Paper Towel
 * Roll" rather than any other row that merely mentions it): exact names first,
 * then a name ending with the words, then starting with them, then containing
 * them — and the shortest name wins a tie. The English plural is tried as well,
 * so "books" still finds "Notebook A5".
 */
function containmentMatch<T extends { id: string; name: string }>(
  key: string,
  catalog: readonly T[]
): T | null {
  let best: T | null = null
  let bestRank = -1
  let bestLength = Number.POSITIVE_INFINITY

  const singular = stripPlural(key)

  for (const item of catalog) {
    const itemKey = normalizeKey(item.name)
    if (itemKey.length < 3) continue

    const rank = Math.max(
      containmentRank(key, itemKey),
      containmentRank(singular, itemKey)
    )
    if (rank < 0) continue

    if (rank > bestRank || (rank === bestRank && itemKey.length < bestLength)) {
      best = item
      bestRank = rank
      bestLength = itemKey.length
    }
  }

  return best
}

/**
 * Resolve a model reference to a real catalog row.
 *
 * Exact id first (the contract), then easier name matches as a safety net, and
 * finally the assumption pass above — so the answer is always a row that really
 * exists, never a name the model made up.
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

  // Containment fallback ("Pencil HB" spoken as "pencil", "roll" for "Paper Towel Roll").
  const contained = containmentMatch(key, catalog)
  if (contained) return contained

  return assumeCatalogItem(name, catalog)
}

/**
 * Confidence stamped on a line the deterministic layer inferred by itself (the
 * model never named it): a genuine guess, so it sits clearly below a model answer
 * while still being far more useful than "not in this store".
 */
const GUESS_CONFIDENCE = 0.55

/**
 * Splits a phrase into the products it actually contains.
 *
 * A cashier — and a speech engine — bundle several products into one breath, and
 * an LLM that gave up returns the whole bundle as one `unmatched` entry:
 * "one potato to three pens and book". A strict lookup of that phrase finds
 * nothing, so walk the words with a sliding window (longest first), resolve every
 * window on its own, and take the number spoken nearest to the window.
 *
 * That turns one dead sentence into:
 *   1 x Potato Chips, 3 x Ballpoint Pen, 1 x Notebook A5 (for a store that has them).
 *
 * Bounded (window ≤ 3 words, ≤ `maxItems` results) and noise-free: a window made
 * only of numbers, units or filler words can never become a product.
 */
function scanPhraseForItems(
  spoken: string,
  catalog: readonly VoiceCatalogItem[],
  maxItems = 8
): { item: VoiceCatalogItem; heard: string; quantity: number }[] {
  const tokens = spoken.split(/\s+/).filter(Boolean)
  const found: { item: VoiceCatalogItem; heard: string; quantity: number }[] = []

  for (let index = 0; index < tokens.length && found.length < maxItems; ) {
    let hit: { item: VoiceCatalogItem; size: number } | null = null

    for (let size = Math.min(3, tokens.length - index); size >= 1; size -= 1) {
      const window = tokens.slice(index, index + size).join(" ")
      // Numbers, units and filler alone are not a product.
      if (stripSpokenQuantity(window).trim() === "") continue

      const item = resolveCatalogItem({ name: window }, catalog)
      if (item) {
        hit = { item, size }
        break
      }
    }

    if (!hit) {
      index += 1
      continue
    }

    const window = tokens.slice(index, index + hit.size).join(" ")

    found.push({
      item: hit.item,
      heard: window,
      quantity: quantityBeside(tokens, index, hit.size),
    })
    index += hit.size
  }

  return found
}

/**
 * The number spoken for one product. In order of preference: a number inside the
 * matched words themselves ("the 2 pens"), then the number right before the
 * product (the pair first, "dua belas pens" → 12), then the number right after it
 * ("pens x3"). Anything further away belongs to another product: in
 * "One potato to three pens", "one" counts the potato and "three" the pens.
 */
function quantityBeside(tokens: readonly string[], index: number, size: number): number {
  const inside = firstQuantity(tokens.slice(index, index + size))
  if (inside !== null) return inside

  const before = tokens[index - 1]
  if (before !== undefined && isQuantityToken(before.toLowerCase())) {
    const pair = index >= 2 ? `${tokens[index - 2]} ${before}` : ""
    const pairValue = pair === "" ? undefined : SPOKEN_QUANTITY[pair]
    if (pairValue !== undefined) return clampQuantity(pairValue)
    return readSpokenQuantity(before, 1)
  }

  const after = tokens[index + size]
  if (after !== undefined && isQuantityToken(after.toLowerCase())) {
    return readSpokenQuantity(after, 1)
  }

  return 1
}

/** The first spoken number inside these words, or null when there is none. */
function firstQuantity(tokens: readonly string[]): number | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const word = tokens[index].toLowerCase()
    if (SPOKEN_QUANTITY[word] !== undefined) return clampQuantity(SPOKEN_QUANTITY[word])

    const next = tokens[index + 1]?.toLowerCase()
    const pair = next === undefined ? undefined : SPOKEN_QUANTITY[`${word} ${next}`]
    if (pair !== undefined) return clampQuantity(pair)

    const digits = DIGIT_QUANTITY.exec(word)
    if (digits) return clampQuantity(Number.parseInt(digits[1], 10))
  }

  return null
}

/**
 * Turns raw model output into a validated result.
 *
 * Anything the model produced that cannot be tied to a real catalog row is
 * dropped from `lines` and reported through `unmatched`, so a hallucinated
 * product can never reach the receipt. Before a phrase is written off it gets one
 * deterministic last chance (`resolveCatalogItem`), so a partial, translated or
 * slangy name still lands on a real row.
 */
export function mapVoiceOrderResult(
  raw: unknown,
  catalog: readonly VoiceCatalogItem[],
  transcript: string,
  language: VoiceLanguage
): VoiceOrderResult {
  const source = asRecord(raw)
  const lines: VoiceOrderLine[] = []
  const seen = new Map<string, VoiceOrderLine>()
  /** Spoken products that even the deterministic passes could not place. */
  const unmatched: VoiceOrderUnmatched[] = []

  /**
   * Adds a line, merging into the existing one when the same row is produced twice
   * (the prompt asks for merged lines, but the scan below can hit a row again) and
   * capping the quantity per line.
   */
  const addLine = (
    item: VoiceCatalogItem,
    quantity: number,
    heard: string,
    confidence: number
  ): void => {
    const existing = seen.get(item.id)
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_QTY_PER_LINE)
      existing.confidence = Math.max(existing.confidence, confidence)
      return
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

  /**
   * The deterministic last chances for ONE phrase the model could not place —
   * both the items whose name/id did not resolve and the model's own `unmatched`
   * entries, so nothing is written off before these run:
   *
   *   1. resolve the whole phrase as a single product ("pens" → "Ballpoint Pen",
   *      "roll" → "Paper Towel Roll", "fred rise" → "Nasi Goreng Rendang");
   *   2. otherwise scan it window by window, because one entry may hold SEVERAL
   *      products ("one potato to three pens and book").
   *
   * Everything it finds is stamped `GUESS_CONFIDENCE` — a best guess the cashier
   * can drop beats "not in this store" for something that was really ordered.
   * Answers whether the phrase produced at least one line.
   */
  const placePhrase = (heard: string): boolean => {
    const rescued = resolveCatalogItem({ name: heard }, catalog)
    if (rescued) {
      addLine(rescued, readSpokenQuantity(heard, 1), heard, GUESS_CONFIDENCE)
      return true
    }

    const scanned = scanPhraseForItems(heard, catalog)
    if (scanned.length === 0) return false

    for (const hit of scanned) {
      addLine(hit.item, hit.quantity, hit.heard, GUESS_CONFIDENCE)
    }
    return true
  }

  const rawItems = Array.isArray(source.items) ? source.items : []
  for (const entry of rawItems) {
    const record = asRecord(entry)
    const heard = asString(record.heard) || asString(record.name) || transcript
    const item = resolveCatalogItem(record, catalog)

    if (!item) {
      // The model named something the catalog may still carry — run the phrase
      // through the deterministic passes before the cashier is told "not found".
      if (placePhrase(heard)) continue

      unmatched.push({ heard, reason: "not found in this store's catalog" })
      continue
    }

    addLine(item, normalizeQuantity(record.quantity), heard, normalizeConfidence(record.confidence))
  }

  const rawUnmatched = Array.isArray(source.unmatched) ? source.unmatched : []
  for (const entry of rawUnmatched) {
    const record = asRecord(entry)
    const heard = asString(record.heard) || asString(record.message)
    if (!heard) continue

    if (placePhrase(heard)) continue

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
