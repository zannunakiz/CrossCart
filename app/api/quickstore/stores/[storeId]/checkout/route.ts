/**
 * POST /api/quickstore/stores/[storeId]/checkout
 *
 * Records a QuickStore sale (the cashier flow):
 *   - validates the session + the `sale:create` permission
 *   - lets `performCheckout` re-price, validate stock and write history + stock
 *     inside a single transaction
 *   - replays the original receipt when the same `clientRequestId` is retried
 *
 * Responses:
 *   201 `{ sale, reused: false }`  — new sale recorded
 *   200 `{ sale, reused: true }`   — duplicate submission, original sale returned
 *   400/404/409 `{ error, code, issues }` — validation problems
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getUserRole } from "@/lib/quickstore/queries"
import { hasPermission } from "@/lib/quickstore/permissions"
import { drizzleCheckoutAccess } from "@/lib/quickstore/checkout-drizzle"
import { CheckoutError, performCheckout } from "@/lib/quickstore/checkout"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  if (!hasPermission(role, "sale:create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_REQUEST" }, { status: 400 })
  }

  const { clientRequestId, lines, paymentMethod, note } = (body ?? {}) as Record<string, unknown>

  if (typeof clientRequestId !== "string") {
    return NextResponse.json(
      { error: "clientRequestId is required", code: "INVALID_REQUEST" },
      { status: 400 }
    )
  }
  if (!Array.isArray(lines)) {
    return NextResponse.json(
      { error: "lines must be an array of { itemId, quantity }", code: "INVALID_REQUEST" },
      { status: 400 }
    )
  }
  if (paymentMethod !== undefined && paymentMethod !== "qr" && paymentMethod !== "cash") {
    return NextResponse.json(
      { error: "paymentMethod must be 'qr' or 'cash'", code: "INVALID_REQUEST" },
      { status: 400 }
    )
  }
  if (note !== undefined && typeof note !== "string") {
    return NextResponse.json({ error: "note must be a string", code: "INVALID_REQUEST" }, { status: 400 })
  }

  try {
    const { receipt, reused } = await performCheckout(drizzleCheckoutAccess, {
      storeId,
      cashierId: session.user.id,
      clientRequestId,
      lines: lines as { itemId: string; quantity: number }[],
      paymentMethod: paymentMethod as "qr" | "cash" | undefined,
      note: note as string | undefined,
    })

    return NextResponse.json({ sale: receipt, reused }, { status: reused ? 200 : 201 })
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        { error: error.message, code: error.code, issues: error.issues },
        { status: error.status }
      )
    }

    console.error("[quickstore/checkout] failed", error)
    return NextResponse.json(
      { error: "Checkout failed, please try again", code: "CHECKOUT_FAILED" },
      { status: 500 }
    )
  }
}
