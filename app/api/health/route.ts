import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return Response.json({ status: 'ok', database: 'connected' })
  } catch {
    return Response.json({ status: 'error', database: 'unreachable' }, { status: 503 })
  }
}
