import { getServerSession } from "next-auth"
import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posMembers, posRoles, users } from "@/lib/db/schema"
import { assertPosPermission } from "@/lib/pos/server"
export const runtime = "nodejs"
export async function GET(_: NextRequest, { params }: { params: Promise<{ storeId: string }> }) { const session = await getServerSession(authOptions); if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { storeId } = await params; try { await assertPosPermission(session.user.id, storeId, "member:manage") } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }; const members = await db.select({ id: posMembers.id, userId: posMembers.userId, active: posMembers.active, createdAt: posMembers.createdAt, name: users.name, email: users.email, roleId: posRoles.id, roleName: posRoles.name, role: posRoles.systemRole }).from(posMembers).innerJoin(users, eq(posMembers.userId, users.id)).innerJoin(posRoles, eq(posMembers.roleId, posRoles.id)).where(eq(posMembers.storeId, storeId)); return NextResponse.json(members) }
