import { getServerSession } from "next-auth"
import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posOrderItems, posOrders } from "@/lib/db/schema"
import { assertPosPermission } from "@/lib/pos/server"
export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const session = await getServerSession(authOptions); if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { storeId } = await params; const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase()
  if (!code || code.length > 12) return NextResponse.json({ error: "Invalid code" }, { status: 400 })
  try { await assertPosPermission(session.user.id, storeId, "order:read") } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  const [order] = await db.select().from(posOrders).where(and(eq(posOrders.storeId, storeId), eq(posOrders.accessCode, code))).limit(1)
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })
  const lines = await db.select().from(posOrderItems).where(eq(posOrderItems.orderId, order.id))
  return NextResponse.json({ ...order, lines })
}
