import { getServerSession } from "next-auth"
import { and, eq, gt } from "drizzle-orm"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posInvites, posMembers, users } from "@/lib/db/schema"
import { hashInviteToken } from "@/lib/pos/invite-token"
export const runtime = "nodejs"
export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions); if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { token } = await params; if (!/^[a-f0-9]{32}$/i.test(token)) return NextResponse.json({ error: "Invalid invite" }, { status: 400 })
  try { const membership = await db.transaction(async (tx) => { const [invite] = await tx.select().from(posInvites).where(and(eq(posInvites.tokenHash, await hashInviteToken(token)), eq(posInvites.status, "pending"), gt(posInvites.expiresAt, new Date()))).for("update").limit(1); if (!invite) throw new Error("INVITE_INVALID"); const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, session.user.id)).limit(1); if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) throw new Error("EMAIL_MISMATCH"); await tx.insert(posMembers).values({ storeId: invite.storeId, userId: session.user.id, roleId: invite.roleId }).onConflictDoNothing(); await tx.update(posInvites).set({ status: "accepted", acceptedAt: new Date() }).where(eq(posInvites.id, invite.id)); return { storeId: invite.storeId, roleId: invite.roleId } }); return NextResponse.json(membership) } catch (error) { const message = error instanceof Error ? error.message : "INVITE_FAILED"; return NextResponse.json({ error: message }, { status: message === "EMAIL_MISMATCH" ? 403 : 409 }) }
}
