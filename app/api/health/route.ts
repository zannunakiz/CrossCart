import { sql } from 'drizzle-orm'

import { cloudinary } from '@/lib/cloudinary'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // ── Database health ────────────────────────────────────────────────────
  let databaseStatus: 'connected' | 'unreachable' = 'unreachable'
  try {
    await db.execute(sql`select 1`)
    databaseStatus = 'connected'
  } catch {
    // intentionally silent — status field captures the failure
  }

  // ── Cloudinary health ──────────────────────────────────────────────────
  // ping() is a lightweight Admin API call that verifies credentials.
  // It will fail gracefully when keys are not yet configured; we still
  // return 200 so CI/health-monitors don't alert on un-configured envs.
  let cloudinaryStatus: 'healthy' | 'unhealthy' | 'not_configured' = 'not_configured'
  try {
    if (
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      await cloudinary.api.ping()
      cloudinaryStatus = 'healthy'
    }
  } catch {
    cloudinaryStatus = 'unhealthy'
  }

  const allOk = databaseStatus === 'connected'
  return Response.json(
    {
      status: allOk ? 'ok' : 'error',
      database: databaseStatus,
      cloudinary: cloudinaryStatus,
    },
    { status: allOk ? 200 : 503 }
  )
}
