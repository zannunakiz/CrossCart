/**
 * The single response envelope every QuickStore Server Action answers with.
 *
 * The former HTTP handlers answered with a status code plus a JSON body; a
 * Server Action has no status line, so the same information travels as data:
 * `{ ok: true, data }` on success, `{ ok: false, error, … }` on failure. The
 * optional `status` keeps the old HTTP code (401/403/404/409/…) so the UI can
 * branch on it exactly as it did before (`403 → /quickstore`,
 * `404 → /not-found`).
 *
 * `error` is always the English message the API used to send — the UI runs it
 * through `serverText()`, so the Indonesian dictionary keeps working unchanged.
 *
 * This module is deliberately free of server imports: it is imported by both
 * the actions and (for types only) the Client Components.
 */
import type { CheckoutIssue } from "@/lib/quickstore/cashier"

/** Everything a refused action can tell the caller. */
export interface ActionFailure {
  /** English message, raw — the UI translates it with `serverText()`. */
  error: string
  /** The HTTP status the old API would have answered with. */
  status?: number
  /** Machine-readable reason (checkout / voice flows). */
  code?: string
  /** Per-line problems of a rejected checkout — drives the inline warnings. */
  issues?: CheckoutIssue[]
}

/** A Server Action answers either the data or the reason it refused. */
export type ActionResult<T> = { ok: true; data: T } | ({ ok: false } & ActionFailure)

/** Success — the action did what it was asked to do. */
export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

/**
 * Failure.
 *
 * Typed `ActionResult<T>` for any `T`, so a caller can write
 * `return fail("Forbidden", { status: 403 })` inside a function declared
 * `Promise<ActionResult<Something>>` with no cast.
 */
export function fail<T = never>(
  error: string,
  extra: Omit<ActionFailure, "error"> = {}
): ActionResult<T> {
  return { ok: false, error, ...extra }
}