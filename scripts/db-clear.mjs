import { config } from 'dotenv'
import { Pool } from 'pg'

config({ path: '.env.local' })

const connectionString = process.env.DATABASE_URI

if (!connectionString) {
  console.error('Missing DATABASE_URI in .env.local')
  process.exit(1)
}

const pool = new Pool({ connectionString })

try {
  const { rows } = await pool.query(
    "select tablename from pg_tables where schemaname = 'public'"
  )

  if (rows.length === 0) {
    console.log('No public tables to clear.')
  } else {
    const list = rows.map((row) => `"${row.tablename}"`).join(', ')
    await pool.query(`truncate table ${list} restart identity cascade`)
    console.log(`Cleared ${rows.length} table(s): ${list}`)
  }
} catch (error) {
  console.error('Failed to clear database:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
