/**
 * Unit tests — QuickStore voice order interpretation (pure, no network, no DB).
 *
 * Covers the deterministic half of the feature: spoken quantities (EN / ID /
 * speech-recognition homophones), partial names ("roll" → "Paper Towel Roll"),
 * translation + phonetic recovery ("fred rise" → "Nasi Goreng"), slang
 * ("piscok", "nam tau"), the last-chance rescue of phrases the model gave up on,
 * and the final mapping rules (de-duplication, quantity clamp, `unmatched`).
 */
import { MAX_QTY_PER_LINE } from "@/lib/quickstore/cashier"
import {
  VOICE_ORDER_SYSTEM_PROMPT,
  assumeCatalogItem,
  mapVoiceOrderResult,
  readSpokenQuantity,
  resolveCatalogItem,
  stripSpokenQuantity,
  translatePhrase,
  type VoiceCatalogItem,
} from "@/lib/quickstore/voice-order"

/** A small bilingual catalog the spoken cases below are matched against. */
const CATALOG: VoiceCatalogItem[] = [
  { id: "pen", name: "Ballpoint Pen" },
  { id: "pencil", name: "Pencil" },
  { id: "sate", name: "Sate Ayam 10 Tusuk" },
  { id: "soto", name: "Soto Ayam Lamongan" },
  { id: "nasi", name: "Nasi Goreng Spesial" },
  { id: "eskrim", name: "Es Krim Vanila" },
  { id: "tahu", name: "Tahu Isi" },
  { id: "piscok", name: "Pisang Coklat" },
  { id: "roll", name: "Paper Towel Roll" },
  { id: "chips", name: "Potato Chips" },
  { id: "notebook", name: "Notebook A5" },
]

/** What the spoken name resolves to, as the cashier would see it. */
function idOf(spoken: string): string | null {
  return resolveCatalogItem({ name: spoken }, CATALOG)?.id ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Spoken quantities
// ─────────────────────────────────────────────────────────────────────────────

describe("readSpokenQuantity", () => {
  it("reads digits, both languages and a trailing x3", () => {
    expect(readSpokenQuantity("5 pena")).toBe(5)
    expect(readSpokenQuantity("dua eskrim")).toBe(2)
    expect(readSpokenQuantity("Pensil x3")).toBe(3)
    expect(readSpokenQuantity("Pencil 4")).toBe(4)
  })

  it("reads the homophones speech recognition produces", () => {
    expect(readSpokenQuantity("nam tau")).toBe(6)
    expect(readSpokenQuantity("tree pencil")).toBe(3)
    expect(readSpokenQuantity("for pen")).toBe(4)
  })

  it("reads compound number words", () => {
    expect(readSpokenQuantity("tiga belas pensil")).toBe(13)
    expect(readSpokenQuantity("dua belas roll")).toBe(12)
  })

  it("falls back to one when no number was spoken", () => {
    expect(readSpokenQuantity("roll")).toBe(1)
    expect(readSpokenQuantity("air mineral")).toBe(1)
    expect(readSpokenQuantity("", 3)).toBe(3)
  })
})

describe("stripSpokenQuantity", () => {
  it("removes the quantity, never the product words", () => {
    expect(stripSpokenQuantity("beli 2 sate")).toBe("beli sate")
    expect(stripSpokenQuantity("nam tau")).toBe("tau")
    // Units belong to the quantity too ("10 Tusuk" is how many, not which).
    expect(stripSpokenQuantity("Sate Ayam 10 Tusuk")).toBe("Sate Ayam")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Name matching
// ─────────────────────────────────────────────────────────────────────────────

describe("partial names (minimum information)", () => {
  it("matches a single slice of a longer catalog name", () => {
    expect(idOf("roll")).toBe("roll")
    expect(idOf("paper towel")).toBe("roll")
    expect(idOf("pisang")).toBe("piscok")
    expect(idOf("book")).toBe("notebook")
  })

  it("keeps the exact name an exact hit", () => {
    expect(idOf("Pencil")).toBe("pencil")
  })
})

describe("word forms and plurals", () => {
  it("matches a plural to the row that carries that word", () => {
    // "pen" is the whole word of "Ballpoint Pen", only a prefix of "Pencil".
    expect(idOf("pens")).toBe("pen")
    expect(idOf("pen")).toBe("pen")
  })

  it("matches the plural of the name itself", () => {
    expect(idOf("pencils")).toBe("pencil")
    expect(idOf("rolls")).toBe("roll")
    expect(idOf("potatoes")).toBe("chips")
    expect(idOf("books")).toBe("notebook")
  })

  it("survives a small typo and a missing space", () => {
    expect(idOf("balpoint pen")).toBe("pen")
    expect(idOf("papper towel roll")).toBe("roll")
  })
})

describe("translation and phonetic recovery", () => {
  it("expands a phrase through the glossary", () => {
    const variants = translatePhrase("fred rise")
    expect(variants).toContain("fried rice")
    expect(variants).toContain("nasi goreng")
  })

  it('lands "fred rise" on the store\'s fried-rice row', () => {
    expect(idOf("fred rise")).toBe("nasi")
    expect(idOf("fried rice")).toBe("nasi")
  })

  it("translates a mixed-language drink and a prefix-typo chocolate", () => {
    expect(idOf("eskrim dua")).toBe("eskrim")
    expect(idOf("pisang cokelat")).toBe("piscok")
  })
})

describe("slang and abbreviations", () => {
  it("expands piscok and reads nam as enam", () => {
    expect(idOf("piscok")).toBe("piscok")
    expect(idOf("nam tau")).toBe("tahu")
  })
})

describe("assumeCatalogItem", () => {
  it("refuses to invent a product that is not there", () => {
    expect(assumeCatalogItem("battery phone charger", CATALOG)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Model output → validated order
// ─────────────────────────────────────────────────────────────────────────────

describe("mapVoiceOrderResult", () => {
  it("keeps a whole absurd sentence, rescuing the product the model gave up on", () => {
    const transcript = "Beli 5 pena tujuh pencil kemarin saya makan eskrim dua"
    const raw = {
      status: "ok",
      items: [
        { itemId: "pen", name: "Ballpoint Pen", quantity: 5, heard: "5 pena" },
        { itemId: "pencil", name: "Pencil", quantity: 7, heard: "7 pencil" },
      ],
      unmatched: [{ heard: "eskrim dua", reason: "unclear" }],
      message: "",
    }

    const result = mapVoiceOrderResult(raw, CATALOG, transcript, "ID")

    expect(result.status).toBe("ok")
    expect(result.lines.map((line) => [line.itemId, line.quantity])).toEqual([
      ["pen", 5],
      ["pencil", 7],
      ["eskrim", 2],
    ])
    // The rescue replaced the "not in this store" entry.
    expect(result.unmatched).toEqual([])
  })

  it("rescues an item the model returned but could not resolve (plural)", () => {
    const raw = {
      status: "ok",
      items: [{ name: "pens", quantity: 3, heard: "three pens" }],
      unmatched: [],
      message: "",
    }

    const result = mapVoiceOrderResult(raw, CATALOG, "three pens", "EN")

    expect(result.status).toBe("ok")
    expect(result.lines.map((line) => [line.itemId, line.quantity])).toEqual([["pen", 3]])
    expect(result.unmatched).toEqual([])
  })

  it("splits a whole sentence the model could not read into its products", () => {
    const transcript = "One potato to three pens and book."
    const raw = {
      status: "undetected",
      items: [{ name: transcript, quantity: 1, heard: transcript }],
      unmatched: [],
      message: "",
    }

    const result = mapVoiceOrderResult(raw, CATALOG, transcript, "EN")

    expect(result.status).toBe("ok")
    expect(result.lines.map((line) => [line.itemId, line.quantity])).toEqual([
      ["chips", 1],
      ["pen", 3],
      ["notebook", 1],
    ])
    expect(result.unmatched).toEqual([])
    // Everything here was inferred by us, so it is flagged as a guess.
    expect(result.lines.every((line) => line.confidence < 0.6)).toBe(true)
  })

  it("still reports a product that genuinely is not in the catalog", () => {
    const raw = {
      status: "undetected",
      items: [],
      unmatched: [{ heard: "battery phone charger" }],
      message: "",
    }

    const result = mapVoiceOrderResult(raw, CATALOG, "battery phone charger", "EN")

    expect(result.status).toBe("undetected")
    expect(result.lines).toEqual([])
    expect(result.unmatched).toEqual([
      { heard: "battery phone charger", reason: "not found in this store's catalog" },
    ])
  })

  it("merges duplicates and clamps the per-line quantity", () => {
    const raw = {
      status: "ok",
      items: [
        { itemId: "pen", name: "Ballpoint Pen", quantity: 900, heard: "9 pena", confidence: 0.4 },
        { itemId: "pen", name: "Ballpoint Pen", quantity: 500, heard: "5 pena", confidence: 0.9 },
      ],
      unmatched: [],
      message: "",
    }

    const result = mapVoiceOrderResult(raw, CATALOG, "sembilan pen", "EN")

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].quantity).toBe(MAX_QTY_PER_LINE)
    expect(result.lines[0].confidence).toBe(0.9)
  })

  it("drops a hallucinated id even when the name looks right", () => {
    const raw = {
      status: "ok",
      items: [
        {
          itemId: "does-not-exist",
          name: "Battery Phone Charger",
          quantity: 1,
          heard: "charger",
        },
      ],
      unmatched: [],
      message: "",
    }

    const result = mapVoiceOrderResult(raw, CATALOG, "charger", "EN")

    expect(result.status).toBe("undetected")
    expect(result.unmatched.map((entry) => entry.heard)).toEqual(["charger"])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Prompt guidance
// ─────────────────────────────────────────────────────────────────────────────

describe("VOICE_ORDER_SYSTEM_PROMPT", () => {
  it("tells the model to read the whole sentence instead of splitting it", () => {
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain("Never split the sentence")
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain("Beli 2 sate dan satu soto")
  })

  it("allows one-word names, translations and slang", () => {
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain("One word is enough")
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain('"roll" is that row')
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain('"fred rise"')
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain('"piscok" = pisang coklat')
  })

  it("never lets a plural send a real product to unmatched", () => {
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain("WORD FORMS, PLURALS AND TYPOS")
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain('"pens"')
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain("Never move it to \"unmatched\" for a grammar difference")
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain("One potato to three pens and book.")
  })

  it("warns that to/for are usually glue words, not numbers", () => {
    expect(VOICE_ORDER_SYSTEM_PROMPT).toContain("usually NOT numbers")
  })
})
