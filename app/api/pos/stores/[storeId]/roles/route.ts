import { getServerSession } from "next-auth"
import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posRoles } from "@/lib/db/schema"
import { assertPosPermission } from "@/lib/pos/server"
export const runtime = "nodejs"

export async function GET(_: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const s = await getServerSession(authOptions)
  if (!s?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { storeId } = await params
  try { await assertPosPermission(s.user.id, storeId, "member:manage") } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  const roles = await db.select({ id: posRoles.id, name: posRoles.name, systemRole: posRoles.systemRole, permissions: posRoles.permissions }).from(posRoles).where(eq(posRoles.storeId, storeId))
  return NextResponse.json(roles)
}
