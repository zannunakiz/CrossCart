import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { eq, inArray } from "drizzle-orm"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { posMembers, posRoles, posStores } from "@/lib/db/schema"

export const runtime = "nodejs"
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40)

export async function GET() {
  const s = await getServerSession(authOptions)
  if (!s?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Owned stores + stores where the user is an active member
  const memberRows = await db
    .select({ storeId: posMembers.storeId })
    .from(posMembers)
    .where(eq(posMembers.userId, s.user.id))
  const memberStoreIds = memberRows.map((r) => r.storeId)
  const allStores = await db
    .select()
    .from(posStores)
    .where(
      memberStoreIds.length
        ? inArray(posStores.id, memberStoreIds)
        : eq(posStores.ownerId, s.user.id)
    )
  // Also include owned stores not yet in memberStoreIds (owner without member row)
  const ownedNotMember = memberStoreIds.length
    ? await db.select().from(posStores).where(eq(posStores.ownerId, s.user.id))
    : []
  const seen = new Set(allStores.map((s) => s.id))
  const merged = [...allStores, ...ownedNotMember.filter((r) => !seen.has(r.id))]
  return NextResponse.json(merged)
}
export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions); if (!s?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null) as { name?: unknown; currency?: unknown; description?: unknown } | null
  if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 20) return NextResponse.json({ error: "Name must be 1–20 characters" }, { status: 400 })
  const base = slugify(body.name); const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`
  const store = await db.transaction(async (tx) => { const [created] = await tx.insert(posStores).values({ ownerId: s.user.id, name: body.name!.trim(), slug, description: typeof body.description === "string" ? body.description.slice(0, 100) : null, currency: body.currency === "USD" ? "USD" : "IDR" }).returning(); const [role] = await tx.insert(posRoles).values({ storeId: created.id, name: "Owner", systemRole: "owner", permissions: [] }).returning(); await tx.insert(posMembers).values({ storeId: created.id, userId: s.user.id, roleId: role.id }); return created })
  return NextResponse.json(store, { status: 201 })
}
