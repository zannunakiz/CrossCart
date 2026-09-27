import { getServerSession } from "next-auth"
import { and, desc, eq, lt, or } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posOrderItems, posOrders } from "@/lib/db/schema"
import { assertPosPermission } from "@/lib/pos/server"
export const runtime = "nodejs"
export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) { const s = await getServerSession(authOptions); if (!s?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { storeId } = await params; try { await assertPosPermission(s.user.id, storeId, "order:read") } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }; const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 30, 1), 100); const cursor = req.nextUrl.searchParams.get("cursor"); const rows = await db.query.posOrders.findMany({ where: cursor ? and(eq(posOrders.storeId, storeId), lt(posOrders.createdAt, new Date(cursor))) : eq(posOrders.storeId, storeId), orderBy: [desc(posOrders.createdAt)], limit, with: { } }); const ids = rows.map((row) => row.id); const lines = ids.length ? await db.select().from(posOrderItems).where(or(...ids.map((id) => eq(posOrderItems.orderId, id)))) : []; return NextResponse.json({ data: rows.map((order) => ({ ...order, lines: lines.filter((line) => line.orderId === order.id) })), nextCursor: rows.length === limit ? rows.at(-1)?.createdAt.toISOString() : null }) }
