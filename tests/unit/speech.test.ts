/**
 * Unit tests — speech transcript helpers (pure, no browser, no microphone).
 *
 * The "double loop" bug: several engines (notably Chrome on Android) deliver one
 * utterance twice — the same final result re-emitted, or the settled words
 * repeated inside the interim result — which showed up as
 * "satu tahu satu tahu" for a single "satu tahu".
 */
import { collapseRepeats, interimTail } from "@/lib/quickstore/speech"

describe("collapseRepeats", () => {
  it("collapses a phrase the engine delivered twice", () => {
    expect(collapseRepeats("satu tahu satu tahu")).toBe("satu tahu")
  })

  it("collapses three copies down to one", () => {
    expect(collapseRepeats("dua tahu dua tahu dua tahu")).toBe("dua tahu")
  })

  it("collapses an English double result", () => {
    expect(collapseRepeats("one potato one potato")).toBe("one potato")
  })

  it("collapses only the repeated tail of a longer sentence", () => {
    expect(collapseRepeats("beli sate satu soto satu soto")).toBe("beli sate satu soto")
  })

  it("normalises whitespace and leaves a normal sentence untouched", () => {
    expect(collapseRepeats("  tiga   pena empat pencil ")).toBe("tiga pena empat pencil")
  })

  it("does not eat a product that legitimately repeats a word once", () => {
    expect(collapseRepeats("es krim")).toBe("es krim")
    expect(collapseRepeats("")).toBe("")
  })
})

describe("interimTail", () => {
  it("drops an interim that only repeats the settled transcript", () => {
    expect(interimTail("satu tahu", "satu tahu")).toBe("")
  })

  it("keeps only the words that are actually new", () => {
    expect(interimTail("satu tahu dan soto", "satu tahu")).toBe("dan soto")
  })

  it("passes a genuinely different interim through", () => {
    expect(interimTail("tiga pena", "satu tahu")).toBe("tiga pena")
  })

  it("returns nothing when there is no interim or no transcript yet", () => {
    expect(interimTail("", "satu tahu")).toBe("")
    expect(interimTail("tiga pena", "")).toBe("tiga pena")
  })
})
