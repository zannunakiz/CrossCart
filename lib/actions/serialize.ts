/**
 * Keeps an action payload in exactly the shape the old HTTP API produced.
 *
 * The query helpers hand back Drizzle rows whose timestamps are `Date` objects,
 * while the Client Components kept the types they had when the same data
 * arrived as JSON (`createdAt: string`, `paidAt: string`, …). React could send
 * a `Date` straight to a Client Component, but that would change the type — and
 * any `typeof value === "string"` check — of every screen that reads a
 * timestamp. One JSON round-trip preserves the previous wire format (ISO
 * strings) so no UI code has to change.
 *
 * The payloads here are one page of rows at most (a catalog page, a page of
 * receipts, a member list), so the extra pass is negligible.
 */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}