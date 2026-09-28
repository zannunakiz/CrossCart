/**
 * Scene 1 — controlled QuickStore fixture.
 *
 * `npm run seed:scene1` rebuilds ONE deterministic scene so the store screens can
 * be demoed, screenshotted or QA'd on demand:
 *
 *   user A (owner) → store "ZZZZZZZZZZZZZZZZZZZZ"
 *   user B         → invited as `master`, creates 10 real items
 *   user C         → invited as `admin`,  creates 12 items named 1WWW…12WWW…
 *   55 sales       → random cashier (A/B/C) × random items over the last 7 days
 *
 * Properties:
 *   - deterministic — a seeded PRNG (see DEFAULT_SEED) makes every run identical,
 *     so screenshots reproduce and a diff is meaningful. `--seed=<n>` overrides.
 *   - idempotent — the previous scene store is deleted first (its members, items
 *     and history cascade away), so re-running never duplicates data: the counts
 *     are always 1 store, 2 members, 22 items, 55 receipts.
 *   - atomic — every write happens in ONE transaction and the receipt invariants
 *     are asserted BEFORE the commit, so a failure leaves no half-built scene.
 *   - realistic — money math mirrors `lib/quickstore/cashier.ts` +
 *     `lib/quickstore/checkout.ts` (integer cents, snapshot lines, per-store
 *     receipt numbers), so the history looks exactly like real checkouts.
 *
 * Missing users are re-created with their fixed id, name and email below —
 * `npm run db:clear` wipes `users` too, so the scene repairs its own cast.
 * Only this scene's own store is ever touched; the rest of the database is left
 * exactly as it was.
 */
import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { Pool } from 'pg'

config({ path: '.env.local', quiet: true })

// ─────────────────────────────────────────────────────────────────────────────
// Fixed cast + scene parameters
// ─────────────────────────────────────────────────────────────────────────────

const USER_A = {
  id: '3aa812d1-44b1-4e8f-a84d-4a948d02b5ec',
  name: 'Richky A_4srg',
  email: 'richky.abednego@gmail.com',
}
const USER_B = {
  id: '805c430f-083d-477f-a6ac-c3d8823e7a26',
  name: 'Richky Abednego',
  email: 'richkyabednego@students.unnes.ac.id',
}
const USER_C = {
  id: '0d898c9d-c207-461d-a9d3-c14d9555d9f6',
  name: 'Four SRG',
  email: 'four.srg@gmail.com',
}

/** Exactly 20 characters — the `stores.name` / `store_items.name` ceiling. */
const STORE_NAME = 'ZZZZZZZZZZZZZZZZZZZZ'
const STORE_DESCRIPTION = 'Scene 1 — controlled demo store'

/** The repeated block user C appends to its item names (`1` + W-run = 19 chars). */
const W_RUN = 'WWWWWWWWWWWWWWWWWW'
const NAME_MAX = 20

const HISTORY_COUNT = 55
const HISTORY_DAYS = 7
const DEFAULT_SEED = 20260929

/** Items user B creates — real products of an Indonesian micro-store. */
const B_ITEMS = [
  { name: 'Kopi Susu', description: 'Kopi susu gula aren 250ml', price: 18000 },
  { name: 'Es Teh Manis', description: 'Teh tubruk dingin 500ml', price: 8000 },
  { name: 'Nasi Goreng', description: 'Nasi goreng spesial warung', price: 25000 },
  { name: 'Mie Instan', description: 'Mie instan kuah, siap seduh', price: 3500 },
  { name: 'Air Mineral 600ml', description: 'Air mineral botol 600ml', price: 4000 },
  { name: 'Roti Tawar', description: 'Roti tawar gandum 10 lembar', price: 15000 },
  { name: 'Sabun Mandi', description: 'Sabun mandi batang 85g', price: 6500 },
  { name: 'Pasta Gigi', description: 'Pasta gigi 120g', price: 12000 },
  { name: 'Minyak Goreng 1L', description: 'Minyak goreng kemasan 1 liter', price: 20000 },
  { name: 'Telur Ayam 1kg', description: 'Telur ayam negeri per kilo', price: 28000 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic “random”, money math and receipt numbers
// ─────────────────────────────────────────────────────────────────────────────

/** mulberry32: tiny seeded PRNG — the reason every run produces the same scene. */
function createRandom(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Inclusive random integer. */
const intBetween = (rand, min, max) => min + Math.floor(rand() * (max - min + 1))

const pick = (rand, list) => list[intBetween(rand, 0, list.length - 1)]

/** Fisher–Yates on a copy — used to draw distinct items per receipt. */
function shuffled(rand, list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = intBetween(rand, 0, i)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Mirrors `toCents` (lib/quickstore/cashier.ts). */
const toCents = (price) => Math.round(Number(price) * 100)

/** Mirrors `discountedUnitCents` (lib/quickstore/cashier.ts). */
const discountedUnitCents = (unitPriceCents, discountPercent) =>
  Math.round((unitPriceCents * (100 - Math.min(Math.max(discountPercent, 0), 100))) / 100)

/** Mirrors `fromCents`: numeric(18,2) as a fixed 2-decimal string. */
const money = (cents) => (cents / 100).toFixed(2)

/** Mirrors `buildReceiptNumber` (lib/quickstore/checkout.ts): QS-YYYYMMDD-XXXXX. */
function buildReceiptNumber(date, rand) {
  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('')

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 5; i += 1) suffix += alphabet[intBetween(rand, 0, alphabet.length - 1)]

  return `QS-${datePart}-${suffix}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene builder — pure, so the whole scene exists in memory before any write
// ─────────────────────────────────────────────────────────────────────────────

/** A sale instant inside the last `HISTORY_DAYS` days, during shop hours. */
function randomPaidAt(rand, now) {
  const day = new Date(now)
  // Spread over one day less than the range on purpose: the History tab's default
  // `7d` preset then still covers every sale even when the viewer's clock is a day
  // ahead of this machine.
  day.setDate(now.getDate() - intBetween(rand, 0, HISTORY_DAYS - 2))
  day.setHours(intBetween(rand, 8, 20), intBetween(rand, 0, 59), intBetween(rand, 0, 59), 0)

  // Never seed a sale in the future — clamp “today” back into the past. Everything
  // stays inside the last 7 days, which is the History tab's default range.
  if (day.getTime() > now.getTime()) {
    return new Date(now.getTime() - intBetween(rand, 1, 55) * 60_000)
  }
  return day
}

/** Item names fit `varchar(20)`; the W-run is trimmed if it ever would not. */
function wName(index) {
  const prefix = String(index)
  return `${prefix}${W_RUN.slice(0, NAME_MAX - prefix.length)}`
}

function buildScene(rand, now) {
  const storeId = randomUUID()
  const storeCreatedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
  const itemsCreatedAt = new Date(storeCreatedAt.getTime() + 60 * 60 * 1000)

  // ── 1. Catalog: B's 10 real products, then C's 12 numbered W-items ──
  const items = [
    ...B_ITEMS.map((item) => ({
      id: randomUUID(),
      userId: USER_B.id,
      name: item.name,
      description: item.description,
      price: item.price,
      discountPercent: pick(rand, [0, 0, 0, 5, 10, 15]),
      tracked: rand() < 0.7,
    })),
    ...Array.from({ length: 12 }, (_, zeroBased) => ({
      id: randomUUID(),
      userId: USER_C.id,
      name: wName(zeroBased + 1),
      description: `Item ${zeroBased + 1} untuk skenario demo`,
      price: intBetween(rand, 10, 100) * 500,
      discountPercent: pick(rand, [0, 0, 5, 10, 15, 20]),
      tracked: rand() < 0.7,
    })),
  ]

  // ── 2. 55 sales, each with its own receipt number and snapshot lines ──
  const sold = new Map(items.map((item) => [item.id, 0]))
  const receiptNumbers = new Set()
  const receipts = []

  for (let n = 1; n <= HISTORY_COUNT; n += 1) {
    const cashier = pick(rand, [USER_A, USER_B, USER_C])
    const paidAt = randomPaidAt(rand, now)
    const lineItems = shuffled(rand, items).slice(0, intBetween(rand, 1, 4))

    const lines = lineItems.map((item, position) => {
      const quantity = intBetween(rand, 1, 4)
      const unitPriceCents = toCents(item.price)
      const unitPricePaidCents = discountedUnitCents(unitPriceCents, item.discountPercent)
      sold.set(item.id, sold.get(item.id) + quantity)

      return {
        id: randomUUID(),
        itemId: item.id,
        name: item.name,
        unitPrice: money(unitPriceCents),
        discountPercent: item.discountPercent,
        unitPricePaid: money(unitPricePaidCents),
        quantity,
        lineTotal: money(unitPricePaidCents * quantity),
        position,
        // Working values for the header totals (never written to the DB).
        subtotalCents: unitPriceCents * quantity,
        discountCents: (unitPriceCents - unitPricePaidCents) * quantity,
        totalCents: unitPricePaidCents * quantity,
      }
    })

    // Receipt numbers are unique per store — the unique index would refuse a clash.
    let receiptNumber = buildReceiptNumber(paidAt, rand)
    while (receiptNumbers.has(receiptNumber)) receiptNumber = buildReceiptNumber(paidAt, rand)
    receiptNumbers.add(receiptNumber)

    receipts.push({
      id: randomUUID(),
      cashierId: cashier.id,
      cashierName: cashier.name,
      receiptNumber,
      subtotal: money(lines.reduce((sum, line) => sum + line.subtotalCents, 0)),
      discountTotal: money(lines.reduce((sum, line) => sum + line.discountCents, 0)),
      total: money(lines.reduce((sum, line) => sum + line.totalCents, 0)),
      lineCount: lines.length,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      paymentMethod: rand() < 0.5 ? 'qr' : 'cash',
      clientRequestId: `seed-scene1-${String(n).padStart(4, '0')}`,
      paidAt,
      lines,
    })
  }

  return {
    store: {
      id: storeId,
      userId: USER_A.id,
      name: STORE_NAME,
      description: STORE_DESCRIPTION,
      open: true,
      createdAt: storeCreatedAt,
    },
    /**
     * The owner (A) needs no row: `getUserRole` treats `stores.user_id` as an
     * implicit master and the members API synthesizes that owner row. B is
     * invited as master, C as admin — both by A.
     */
    members: [
      { id: randomUUID(), userId: USER_B.id, role: 'master', createdAt: storeCreatedAt },
      { id: randomUUID(), userId: USER_C.id, role: 'admin', createdAt: storeCreatedAt },
    ],
    /**
     * `purchased_amount` is what the sales sold; `stocks` is written as the
     * post-sale remainder (sold + a small restock) so the seeded history and the
     * catalog can never contradict each other — and stock never goes negative.
     */
    items: items.map((item) => ({
      id: item.id,
      storeId,
      userId: item.userId,
      name: item.name,
      description: item.description,
      price: money(toCents(item.price)),
      available: true,
      stocks: item.tracked ? sold.get(item.id) + intBetween(rand, 5, 60) : null,
      discountPercent: item.discountPercent,
      purchasedAmount: sold.get(item.id),
      createdAt: itemsCreatedAt,
    })),
    receipts,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Database
// ─────────────────────────────────────────────────────────────────────────────

/** `($1, $2), ($3, $4)…` — one placeholder group per row of a bulk insert. */
function placeholders(rowCount, columnCount) {
  let index = 1
  const groups = []
  for (let row = 0; row < rowCount; row += 1) {
    const group = []
    for (let column = 0; column < columnCount; column += 1) group.push(`$${index++}`)
    groups.push(`(${group.join(', ')})`)
  }
  return groups.join(', ')
}

/**
 * Put a fixed-id scene user back when it is missing (e.g. after `db:clear`,
 * which truncates `users` too). The id / name / email are the ones this scene
 * was built around, so ownership and membership keep pointing at the right
 * account.
 */
async function ensureUser(client, user) {
  const existing = await client.query('select id from users where id = $1', [user.id])
  if (existing.rows.length > 0) {
    console.log(`  ✓ ${user.name} (${user.id})`)
    return
  }

  await client.query(
    'insert into users (id, name, email) values ($1, $2, $3) on conflict do nothing',
    [user.id, user.name, user.email]
  )

  const recreated = await client.query('select id from users where id = $1', [user.id])
  if (recreated.rows.length > 0) {
    console.log(`  + ${user.name} (${user.id}) — re-created`)
    return
  }

  // The email already belongs to another id: keep the fixed id and drop the
  // email, so a later Google sign-in can claim that address with its own row.
  await client.query(
    'insert into users (id, name, email) values ($1, $2, null) on conflict do nothing',
    [user.id, user.name]
  )

  const retried = await client.query('select id from users where id = $1', [user.id])
  if (retried.rows.length === 0) {
    throw new Error(`Could not create scene user ${user.id}`)
  }
  console.warn(`  ! ${user.name} (${user.id}) re-created without email — ${user.email} is taken`)
}

/** Drop the previous scene store; its members / items / history cascade away. */
async function resetScene(client, ownerId) {
  const { rowCount } = await client.query(
    'delete from stores where name = $1 and user_id = $2',
    [STORE_NAME, ownerId]
  )
  if (rowCount > 0) console.log(`  ↺ previous scene store removed (${rowCount} store)`)
}

/** Write the whole scene: store → members → items → 55 receipts → lines. */
async function insertScene(client, scene) {
  const writtenAt = new Date()
  const { store } = scene

  await client.query(
    `insert into stores (id, user_id, name, description, open, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $6)`,
    [store.id, store.userId, store.name, store.description, store.open, store.createdAt]
  )

  await client.query(
    `insert into store_members (id, store_id, user_id, role, invited_by, created_at, updated_at)
     values ${placeholders(scene.members.length, 7)}`,
    scene.members.flatMap((member) => [
      member.id,
      store.id,
      member.userId,
      member.role,
      store.userId,
      member.createdAt,
      member.createdAt,
    ])
  )

  await client.query(
    `insert into store_items
       (id, store_id, user_id, name, description, price, available, stocks,
        discount_percent, purchased_amount, created_at, updated_at)
     values ${placeholders(scene.items.length, 12)}`,
    scene.items.flatMap((item) => [
      item.id,
      item.storeId,
      item.userId,
      item.name,
      item.description,
      item.price,
      item.available,
      item.stocks,
      item.discountPercent,
      item.purchasedAmount,
      item.createdAt,
      writtenAt,
    ])
  )

  await client.query(
    `insert into qs_history
       (id, store_id, cashier_id, cashier_name, receipt_number, status, currency,
        subtotal, discount_total, total, line_count, item_count, payment_method,
        note, client_request_id, paid_at, created_at)
     values ${placeholders(scene.receipts.length, 17)}`,
    scene.receipts.flatMap((receipt) => [
      receipt.id,
      store.id,
      receipt.cashierId,
      receipt.cashierName,
      receipt.receiptNumber,
      'completed',
      'IDR',
      receipt.subtotal,
      receipt.discountTotal,
      receipt.total,
      receipt.lineCount,
      receipt.itemCount,
      receipt.paymentMethod,
      null,
      receipt.clientRequestId,
      receipt.paidAt,
      receipt.paidAt,
    ])
  )

  const lines = scene.receipts.flatMap((receipt) =>
    receipt.lines.map((line) => ({ ...line, historyId: receipt.id }))
  )

  await client.query(
    `insert into qs_history_items
       (id, history_id, item_id, name, unit_price, discount_percent, unit_price_paid,
        quantity, line_total, position, created_at)
     values ${placeholders(lines.length, 11)}`,
    lines.flatMap((line) => [
      line.id,
      line.historyId,
      line.itemId,
      line.name,
      line.unitPrice,
      line.discountPercent,
      line.unitPricePaid,
      line.quantity,
      line.lineTotal,
      line.position,
      writtenAt,
    ])
  )

  return lines.length
}

/**
 * Assert the scene invariants by re-reading the rows — BEFORE the commit, so an
 * unexpected scene can never land in the database.
 */
async function verifyScene(client, scene) {
  const { rows } = await client.query(
    `select
       (select count(*) from stores where id = $1) as stores,
       (select count(*) from store_members where store_id = $1) as members,
       (select count(*) from store_items where store_id = $1) as items,
       (select count(*) from store_items where store_id = $1 and user_id = $2) as b_items,
       (select count(*) from store_items where store_id = $1 and user_id = $3) as c_items,
       (select count(*) from qs_history where store_id = $1) as receipts,
       (select count(distinct receipt_number) from qs_history where store_id = $1) as numbers,
       (select count(*) from qs_history h where h.store_id = $1
          and h.total <> (select coalesce(sum(i.line_total), 0)
                          from qs_history_items i where i.history_id = h.id)) as bad_totals,
       (select count(*) from qs_history h where h.store_id = $1
          and h.line_count <> (select count(*) from qs_history_items i
                               where i.history_id = h.id)) as bad_line_counts,
       (select count(*) from qs_history h where h.store_id = $1
          and h.item_count <> (select coalesce(sum(i.quantity), 0)
                               from qs_history_items i where i.history_id = h.id)) as bad_item_counts,
       (select count(*) from qs_history_items i
          join qs_history h on h.id = i.history_id
         where h.store_id = $1) as lines,
       (select count(*) from qs_history_items i
          join qs_history h on h.id = i.history_id
         where h.store_id = $1 and i.item_id is null) as orphan_lines,
       (select count(*) from store_items where store_id = $1
          and stocks is not null and (stocks < 0 or stocks > 999)) as bad_stocks,
       (select coalesce(sum(total), 0)::text from qs_history where store_id = $1) as revenue
     `,
    [scene.store.id, USER_B.id, USER_C.id]
  )

  const expectedLines = scene.receipts.reduce((sum, receipt) => sum + receipt.lines.length, 0)
  const row = rows[0]
  const checks = [
    ['1 scene store', Number(row.stores), 1],
    ['2 members (master + admin)', Number(row.members), 2],
    ['22 items', Number(row.items), 22],
    ['10 items created by user B', Number(row.b_items), 10],
    ['12 items created by user C', Number(row.c_items), 12],
    [`${HISTORY_COUNT} transactions`, Number(row.receipts), HISTORY_COUNT],
    [`${HISTORY_COUNT} distinct receipt numbers`, Number(row.numbers), HISTORY_COUNT],
    [`${expectedLines} receipt lines`, Number(row.lines), expectedLines],
    ['total = Σ line_total on every receipt', Number(row.bad_totals), 0],
    ['line_count matches the lines', Number(row.bad_line_counts), 0],
    ['item_count matches the units', Number(row.bad_item_counts), 0],
    ['every line points at a seeded item', Number(row.orphan_lines), 0],
    ['stock within 0-999 (or unlimited)', Number(row.bad_stocks), 0],
  ]

  let failed = 0
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected
    if (!ok) failed += 1
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`)
  }
  if (failed > 0) throw new Error(`${failed} scene invariant(s) failed — nothing was written`)

  return { lines: expectedLines, revenue: Number(row.revenue) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const seedArg = process.argv.find((arg) => arg.startsWith('--seed='))
const seed = seedArg ? Number.parseInt(seedArg.slice('--seed='.length), 10) : DEFAULT_SEED
const connectionString = process.env.DATABASE_URI

if (!connectionString) {
  console.error('Missing DATABASE_URI in .env.local')
  process.exit(1)
}
if (!Number.isFinite(seed)) {
  console.error('--seed must be an integer')
  process.exit(1)
}

const rand = createRandom(seed)
const scene = buildScene(rand, new Date())

console.log(`Scene 1 — quickstore seed (seed ${seed})`)
console.log('Users:')

const pool = new Pool({ connectionString })
const client = await pool.connect()

try {
  await client.query('begin')

  // 1. The cast — user A (owner), user B (master), user C (admin).
  for (const user of [USER_A, USER_B, USER_C]) await ensureUser(client, user)

  // 2. Store created by A, with everything the scene owns.
  console.log('Store:')
  await resetScene(client, USER_A.id)
  const lineCount = await insertScene(client, scene)
  console.log(`  + ${scene.store.name} (${scene.store.id}) owned by user A`)

  // 3. Invites, catalog and history are in — verify before committing.
  console.log('Verification:')
  const summary = await verifyScene(client, scene)

  await client.query('commit')

  console.log('')
  console.log('Scene 1 ready ✔')
  console.log(`  store     ${scene.store.name} — /quickstore/${scene.store.id}`)
  console.log(`  owner     user A (${USER_A.name})`)
  console.log('  members   user B (master) • user C (admin)')
  console.log(`  items     22 — 10 by user B, 12 by user C (names 1${W_RUN} … 12${W_RUN})`)
  console.log(
    `  receipts  ${HISTORY_COUNT} in the last ${HISTORY_DAYS} days — ` +
      `${lineCount} lines (${summary.lines} verified), revenue IDR ${summary.revenue.toLocaleString('id-ID')}`
  )
} catch (error) {
  await client.query('rollback').catch(() => {})
  console.error('Scene 1 failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}

