import { getServerSession } from "next-auth"
import { and, eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posCategories } from "@/lib/db/schema"
import { assertPosPermission } from "@/lib/pos/server"
export const runtime = "nodejs"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ storeId: string; categoryId: string }> }) {
  const s = await getServerSession(authOptions)
  if (!s?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { storeId, categoryId } = await params
  try { await assertPosPermission(s.user.id, storeId, "catalog:write") } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  const body = await req.json().catch(() => null) as { name?: unknown; description?: unknown; sortOrder?: unknown } | null
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  const [cat] = await db.update(posCategories).set({
    ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 48) } : {}),
    ...(body.description !== undefined ? { description: typeof body.description === "string" ? body.description.slice(0, 140) : null } : {}),
    ...(body.sortOrder !== undefined && Number.isInteger(body.sortOrder) ? { sortOrder: Number(body.sortOrder) } : {}),
    updatedAt: new Date(),
  }).where(and(eq(posCategories.id, categoryId), eq(posCategories.storeId, storeId))).returning()
  return cat ? NextResponse.json(cat) : NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ storeId: string; categoryId: string }> }) {
  const s = await getServerSession(authOptions)
  if (!s?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { storeId, categoryId } = await params
  try { await assertPosPermission(s.user.id, storeId, "catalog:write") } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  // Soft delete — deactivate and unlink items by setting categoryId null via DB cascade (or just delete)
  await db.delete(posCategories).where(and(eq(posCategories.id, categoryId), eq(posCategories.storeId, storeId)))
  return NextResponse.json({ ok: true })
}
