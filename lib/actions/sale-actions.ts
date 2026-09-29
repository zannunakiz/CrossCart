"use server"

/**
 * QuickStore — checkout (recording a sale).
 *
 * Direct port of the former `POST /api/quickstore/stores/[storeId]/checkout`
 * handler:
 *   - validates the session + the `sale:create` permission
 *   - lets `performCheckout` re-price, validate stock and write history + stock
 *     inside a single transaction
 *   - replays the original receipt when the same `clientRequestId` is retried
 *
 * The two outcomes the UI cares about travel in the envelope: `data.reused`
 * (a duplicate submission returned the original sale) and, on failure, `code` +
 * `issues` (stale stock / unavailable products → refresh and clamp the cart).
 */
import { CheckoutError, performCheckout } from "@/lib/quickstore/checkout"
import { drizzleCheckoutAccess } from "@/lib/quickstore/checkout-drizzle"
import type { Receipt } from "@/lib/quickstore/cashier"
import { hasPermission } from "@/lib/quickstore/permissions"
import { getUserRole } from "@/lib/quickstore/queries"
import { currentSession } from "./context"
import { fail, ok, type ActionResult } from "./result"
import { jsonSafe } from "./serialize"

export async function checkoutSale(
  storeId: string,
  input: {
    clientRequestId: string
    lines: { itemId: string; quantity: number }[]
    note?: string
  }
): Promise<ActionResult<{ sale: Receipt; reused: boolean }>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  if (!hasPermission(role, "sale:create")) return fail("Forbidden", { status: 403 })

  const { clientRequestId, lines, note } = input

  if (typeof clientRequestId !== "string") {
    return fail("clientRequestId is required", { status: 400, code: "INVALID_REQUEST" })
  }
  if (!Array.isArray(lines)) {
    return fail("lines must be an array of { itemId, quantity }", {
      status: 400,
      code: "INVALID_REQUEST",
    })
  }
  if (note !== undefined && typeof note !== "string") {
    return fail("note must be a string", { status: 400, code: "INVALID_REQUEST" })
  }

  try {
    const { receipt, reused } = await performCheckout(drizzleCheckoutAccess, {
      storeId,
      cashierId: session.userId,
      // Snapshot the display name so the receipt survives account deletion.
      cashierName: session.name ?? session.email ?? null,
      clientRequestId,
      lines,
      note,
    })

    return ok(jsonSafe({ sale: receipt, reused }))
  } catch (error) {
    if (error instanceof CheckoutError) {
      return fail(error.message, {
        status: error.status,
        code: error.code,
        issues: error.issues,
      })
    }

    // console.error("[quickstore/checkout] failed", error)
    return fail("Checkout failed, please try again", { status: 500, code: "CHECKOUT_FAILED" })
  }
}