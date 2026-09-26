import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { neonPool?: Pool }

export const pool =
  globalForDb.neonPool ??
  new Pool({
    connectionString: process.env.DATABASE_URI,
    max: 10,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.neonPool = pool
}

export const db = drizzle(pool, { schema })
