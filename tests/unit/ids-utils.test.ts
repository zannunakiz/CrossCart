/** Unit tests — small pure helpers (UUID guard + className merger). */
import { isUuid } from "@/lib/ids"
import { cn } from "@/lib/utils"

describe("isUuid", () => {
  test("accepts the canonical 8-4-4-4-12 hex form", () => {
    expect(isUuid("123e4567-e89b-42d3-a456-426614174000")).toBe(true)
    expect(isUuid("123E4567-E89B-42D3-A456-426614174000")).toBe(true) // case-insensitive
  })

  test("rejects malformed ids before they can reach the uuid column", () => {
    expect(isUuid("")).toBe(false)
    expect(isUuid("0094d5f3-aezzz")).toBe(false) // truncated route id
    expect(isUuid("123e4567e89b42d3a456426614174000")).toBe(false) // no dashes
    expect(isUuid("123e4567-e89b-42d3-a456-42661417400")).toBe(false) // short
    expect(isUuid("gggggggg-e89b-42d3-a456-426614174000")).toBe(false) // non-hex
    expect(isUuid("'; DROP TABLE stores; --")).toBe(false) // injection attempt
    expect(isUuid("123e4567-e89b-42d3-a456-426614174000-extra")).toBe(false)
  })
})

describe("cn", () => {
  test("joins truthy class names and lets tailwind-merge win", () => {
    expect(cn("a", "b")).toBe("a b")
    expect(cn("a", false && "b", "c")).toBe("a c")
    expect(cn("px-2", "px-4")).toBe("px-4") // conflicting utility → last one
    expect(cn()).toBe("")
  })
})
