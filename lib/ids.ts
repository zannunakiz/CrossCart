// Route params that address a row are UUIDs (`uuid` columns), so a malformed id
// such as `/quickstore/0094d5f3-...-aezzz` must be rejected *before* it reaches
// Postgres: comparing a `uuid` column with a non-UUID literal raises 22P02
// (`invalid input syntax for type uuid`), which would surface as a 500 instead
// of the "store not found" answer every caller already handles.

/** Canonical 8-4-4-4-12 hex form — what `defaultRandom()` (UUID v4) produces. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when `value` can safely be compared against a `uuid` column. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}
