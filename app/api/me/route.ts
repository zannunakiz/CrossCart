import { eq } from "drizzle-orm"
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { accounts, users } from "@/lib/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Returns the current session plus the DB user and their linked OAuth accounts.
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false, session: null }, { status: 401 })
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
  const linkedAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, session.user.id))

  return NextResponse.json({
    authenticated: true,
    session,
    user: user ?? null,
    accounts: linkedAccounts,
  })
}
