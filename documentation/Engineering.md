# CrossCart — Engineering Deep Dive

<p align="center">
  <img src="../public/logo.png" width="120" alt="CrossCart" />
</p>

<p align="center">
  <b>How the machine is built</b> — the QuickStore transaction engine, the voice-order pipeline,<br/>
  the permission matrix, and the flow system that keeps every one of them honest.
</p>

> Companion documents: [`Overall.md`](./Overall.md) (full stack, data model, features, testing) ·
> [`../README.md`](../README.md) (project overview).

---

## Table of Contents

1. [The system map](#1-the-system-map)
2. [The flow system — Server Actions as the only entry point](#2-the-flow-system--server-actions-as-the-only-entry-point)
3. [Scalable RBAC — permissions, not roles](#3-scalable-rbac--permissions-not-roles)
4. [The QuickStore transaction engine](#4-the-quickstore-transaction-engine)
5. [The voice-order pipeline](#5-the-voice-order-pipeline)
6. [The analytics engine](#6-the-analytics-engine)
7. [Demo mode — the same UI, no server](#7-demo-mode--the-same-ui-no-server)
8. [The data layer](#8-the-data-layer)
9. [Observability, security and resilience](#9-observability-security-and-resilience)
10. [Client architecture — theme, language, URL as state](#10-client-architecture--theme-language-url-as-state)
11. [Testing and CI](#11-testing-and-ci)
12. [Trade-offs and roadmap](#12-trade-offs-and-roadmap)

---

## 1. The system map

```
┌──────────────────────────────────────────── BROWSER ─────────────────────────────────────────────┐
│  Server Components (data-shaped markup)  ·  Client Components (cashier, tabs, dialogs)           │
│  localStorage: theme + language (useSyncExternalStore)  ·  URL: tab + filters (shareable state)  │
│  Web Speech API ─────────────┐                                                                   │
└──────────────────────────────┼───────────────────────────────────────────────────────────────────┘
                               │  Server Action call (POST, session cookie attached)
┌──────────────────────────────▼───────────────────────────────────────────────────────────────────┐
│  app/**/layout.tsx            session gate for the (main) shell                                   │
│  app/api/auth/[...nextauth]   the only route handler                                              │
│  ── lib/actions/** ───────────────────────────────────────────────────────────────────────────  │
│     context.ts   currentSession()          → who is calling (401 otherwise)                       │
│     queries.ts   getUserRole(user, store)  → role, or null for a guest / dead store (403)         │
│     permissions  hasPermission(role, perm) → the capability check                                 │
│     result.ts    ok() / fail()             → one typed envelope for every outcome                 │
│  ── lib/quickstore/** (PURE: no Next.js, no DB) ──────────────────────────────────────────────  │
│     cashier · checkout · voice-order · speech · history · item-list · csv · receipt-image         │
│  ── lib/db/** ────────────────────────────────────────────────────────────────────────────────  │
│     schema.ts (Drizzle)  ·  index.ts (pg Pool, max 10, global-cached)                             │
│     adapter: checkout-drizzle.ts — the ONLY module that writes sale SQL                           │
└───────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                                │  TCP + TLS
                              ┌─────────────────▼─────────────────┐
                              │      Neon Postgres (serverless)   │
                              │  FKs · CHECKs · functional uniques│
                              └───────────────────────────────────┘
External providers:  Google OAuth · OpenRouter (voice) · Cloudinary (signed uploads) · Sentry
```

**Three rules shape the whole repository:**

1. **Framework at the edges.** `lib/quickstore/**` is plain TypeScript — it never imports `next/*` and never
   touches the database, so the business rules can be tested directly, without a runtime.
2. **One door for data.** Every mutation is a Server Action under `lib/actions/**`; every action re-checks
   identity, role and permission before it does anything else.
3. **The database is the last line of defence.** Uniqueness, ranges and referential integrity are constraints and
   indexes, not UI validation — the client is a convenience, never the enforcement point.

---

## 2. The flow system — Server Actions as the only entry point

CrossCart exposes **no public API of its own**. `app/api/auth/[...nextauth]/route.ts` is the single route handler
left in the tree; everything else moved into Server Actions. That is a security decision, not a fashion choice:

- A route handler must be *found* to be protected. Every new endpoint is a new opportunity to forget a guard.
- An action is a typed function the component already imports — the session check lives **inside** the function,
  next to the logic it protects, and travels with it.

### The guard chain (every action, without exception)

```ts
export async function checkoutSale(storeId, input) {
  const session = await currentSession()                     // 401 — who is this?
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)    // null = guest / soft-deleted store
  if (!hasPermission(role, "sale:create")) return fail("Forbidden", { status: 403 })

  // …validate the payload, then hand over to pure domain logic…
}
```

`currentSession()` is the only source of identity: the user id comes from the verified session cookie, never from
the arguments. A Server Action still answers a plain POST, so a caller who forges the arguments gains nothing —
the role is re-derived from the database on every call.

### One envelope for every outcome

```ts
export type ActionResult<T> = { ok: true; data: T } | ({ ok: false } & {
  error: string              // English sentence, translated by the UI's serverText()
  status?: number            // the HTTP code the old REST API would have used
  code?: string              // machine-readable: INSUFFICIENT_STOCK, EMPTY_TRANSCRIPT, …
  issues?: CheckoutIssue[]   // per-line detail for a rejected checkout
})
```

The UI branches on the envelope exactly as it did on status codes (`403 → back to /quickstore`,
`404 → not-found`), while `issues` drives inline per-line warnings instead of one vague toast.

### Wire-format stability

Drizzle hands back `Date` objects; the Client Components were written against ISO strings. `jsonSafe()` performs a
deliberate JSON round-trip (`lib/actions/serialize.ts`) so `createdAt`, `paidAt` and friends stay strings and no
screen needed a single change during the REST → Server Action migration. Cost: one pass over a page of rows.
Benefit: zero churn in fourteen components.

### Error hygiene

Actions never leak internals. Framework limits (an oversized body), provider hiccups (OpenRouter down) and thrown
errors all collapse into user-safe messages; anything unnameable becomes the single phrase
`Something went wrong. Please try again.` — which exists in the i18n dictionary, so it speaks Indonesian too.
Original errors go to Sentry, not to the customer's screen.

### The action surface

| Module | Actions | Capability required |
|---|---|---|
| `store-actions.ts` | list, get, create, update, delete | session; `store:view` / `store:update-*` / `store:delete` |
| `item-actions.ts` | list catalog, list page, create, update, delete | `item:view` / `item:create` / `item:update` / `item:delete` |
| `member-actions.ts` | list, invite, change role, remove | `member:view` / `member:invite` / `member:update-role` / `member:remove` |
| `sale-actions.ts` | checkout | `sale:create` |
| `voice-actions.ts` | interpret a transcript | `sale:create` (it feeds the cart) |
| `history-actions.ts` | list receipts, summary | `sale:view` |
| `upload-actions.ts` | signed QR upload | session + size/type re-validation |

Note the pattern: **action modules mirror resources, capability checks mirror the matrix.** Adding a resource
means adding one module — not hunting for every place a role was hard-coded.

---

## 3. Scalable RBAC — permissions, not roles

The naive multi-tenant implementation asks `if (role === "admin")` in thirty places. It works until the first
feature request ("let admins read history but not export it"), and then it is a refactor.

CrossCart answers the other question: **what may this caller *do* to this store?** Sixteen `resource:action`
permissions live in one auditable matrix (`lib/quickstore/permissions.ts`):

| Permission | Master | Admin | Guest |
|---|:--:|:--:|:--:|
| `store:view` | ✅ | ✅ | ❌ |
| `store:update-details` | ✅ | ❌ | ❌ |
| `store:update-status` | ✅ | ✅ | ❌ |
| `store:update-credential` | ✅ | ❌ | ❌ |
| `store:delete` | ✅ | ❌ | ❌ |
| `member:view` | ✅ | ✅ | ❌ |
| `member:invite` | ✅ | ❌ | ❌ |
| `member:update-role` | ✅ | ❌ | ❌ |
| `member:remove` | ✅ | ❌ | ❌ |
| `item:view` · `item:create` · `item:update` · `item:delete` | ✅ | ✅ | ❌ |
| `sale:view` · `sale:create` | ✅ | ✅ | ❌ |
| `sale:void` | ✅ | ❌ | ❌ |

```ts
const ROLE_PERMISSIONS: Record<StoreRole, readonly Permission[]> = {
  master: ALL_PERMISSIONS,
  admin: ["store:view", "store:update-status", "member:view", "item:view",
          "item:create", "item:update", "item:delete", "sale:view", "sale:create"],
}
```

### The API surface

`hasPermission(role, perm)` is the primitive. `hasAnyPermission` / `hasAllPermissions` / `getPermissions` compose
it, and named helpers give the call sites a readable vocabulary — `canCreateSale(role)`,
`canEditStoreCredential(role)`, `canManageMembers(role)`, `canDeleteStore(role)` — so a component never builds a
boolean out of raw strings.

### One matrix, three enforcement surfaces

| Surface | How the matrix is used | Failure mode prevented |
|---|---|---|
| **Server** | Every action calls `hasPermission` before touching data | A hand-crafted POST from a guest or a cross-store user |
| **UI** | Tabs and buttons render only when the permission is held | A user clicking a control that would be refused |
| **URL** | `?tab=items` is validated with the same matrix; an illegal tab is rewritten in the address bar | A stale or shared link landing on a forbidden view |

The tab definition itself (`lib/quickstore/store-tabs.ts`) is the single source of truth: each tab declares the
permission that unlocks it, so the URL parser, the tab strip and the sidebar's tab list **cannot disagree**.

### Identity rules that hold regardless of the matrix

- **Ownership is implicit mastery.** `stores.userId` is treated as `master` even if the owner has no membership
  row — a store can never lock its creator out of itself.
- **No self-service escalation.** A caller may not change their own membership, and the owner row can never be
  re-roled or removed by anyone.
- **Invitations target existing users** by email; already-members answer `409`, non-users `404`.
- **Cross-store requests are indistinguishable from missing data** — a store you are not in, a store that does not
  exist, a soft-deleted store and a malformed UUID all answer the same "not found"/"forbidden" pair, so the API
  never confirms that someone else's store exists.
- **Malformed ids never reach Postgres.** `isUuid()` short-circuits before a `uuid` comparison, which would
  otherwise raise `22P02` and surface as a 500 instead of a clean 403.

### Extending it (three additive steps, no schema change)

1. Add the role to the `store_role` enum (one migration).
2. Add its permission list to `ROLE_PERMISSIONS` (one edit).
3. If UI needs a hint, extend a named helper — call sites stay untouched.

Per-member overrides (a `store_member_permissions` table) or a `viewer` role slot in the same way: the matrix is
the only place capability is decided, so nothing downstream has to learn about the new concept.

---

## 4. The QuickStore transaction engine

A cashier is a correctness problem wearing a UI. The engine is therefore split into four layers, each with a
narrow responsibility and its own test surface:

| Layer | File | Contains | Depends on |
|---|---|---|---|
| Domain | `lib/quickstore/cashier.ts` | money, cart, availability, ranking, confirm state machine | nothing |
| Orchestration | `lib/quickstore/checkout.ts` | `performCheckout` rules + `CheckoutError` | the domain + a **port interface** |
| Adapter | `lib/quickstore/checkout-drizzle.ts` | the SQL that implements the port | Drizzle + the schema |
| Edge | `lib/actions/sale-actions.ts` | session, permission, input validation, envelope | the orchestration layer |

The payoff: `performCheckout` is tested end-to-end against an in-memory port (`tests/unit/checkout.test.ts`) —
idempotent replay, rollback, stock races and totals are all provable **without a database**.

### Layer 1 — the domain (`cashier.ts`)

- **Money is never a float.** Prices arrive as strings from `numeric(18,2)`, are converted to integer cents
  (`toCents`), all arithmetic happens in cents, and only the presentation layer formats them back (`formatCents`).
  Rounding can therefore never accumulate drift across a receipt.
- **Availability is a pure predicate.** `checkAvailability(item, quantity)` answers why a line is unsellable
  (`UNAVAILABLE`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `INVALID_QUANTITY`, …) and `clampQuantity` turns a typed
  number into a legal one — the same rules the server enforces, reusable by the cart, the voice review panel and
  the demo.
- **Search ranking is local and bounded.** `rankItems(query, catalog)` scores name/description matches and the
  autocomplete renders at most `MAX_SUGGESTIONS` (3) rows — a 5 000-item catalog never blocks typing.
- **The confirmation is a state machine.** `checkoutReducer` moves through
  `idle → confirming (3 s locked) → submitting → done | error`. The countdown exists so a cashier hammering the
  button in a queue cannot ring up two sales; the lock is part of the state, not a CSS trick.
  `isConfirmLocked` / `isSubmitting` expose it to the component.

### Layer 2 — orchestration (`performCheckout`)

```
① idempotent replay      clientRequestId already stored? → return that receipt, reused: true
② lock the products      SELECT … FOR UPDATE, ids sorted → deterministic order, no deadlocks
③ validate + reprice     existence → available → stock → discount clamp → integer cents
④ write history          header (totals, counts, note, cashier snapshot) + lines (snapshot, position)
⑤ move stock             conditional decrement + purchased_amount increment, guarded in SQL
                         any failure → throw → the whole transaction rolls back
```

Details that matter in production:

- **The client cannot influence price.** Requested lines carry only `itemId` + `quantity`; unit price, discount
  and totals are read from the locked rows and recomputed. A tampered cart changes nothing.
- **All problems are reported at once.** `prepareCheckoutLines` collects *every* missing / unavailable /
  short-stocked line and throws one `CheckoutError` carrying an `issues[]` array, so the cashier fixes the whole
  cart in one pass instead of playing whack-a-mole.
- **Receipt numbers survive collisions.** `QS-YYYYMMDD-XXXX` is generated per attempt; a unique-constraint
  violation is detected (`isUniqueViolation`) and retried with a fresh suffix instead of failing the sale.
- **Stock can never go negative.** Even beyond the row lock, the `UPDATE` carries
  `stocks is null or stocks >= qty` — a non-locking writer (a script, a future endpoint) cannot push stock below
  zero, and the conditional update's zero-row result is translated back into a per-line `INSUFFICIENT_STOCK`.
- **NULL stock means unlimited** and is deliberately left untouched by the decrement.

### Layer 3 — the adapter (`checkout-drizzle.ts`)

The only module in the codebase that writes sale SQL, and the only one the tests never import:

- `lockItems` — `SELECT … FOR UPDATE`, store-scoped, `ORDER BY id` so two concurrent checkouts acquire locks in the
  same order (a classic deadlock source, removed by sorting).
- `findReceiptByRequestId` — the replay lookup, backed by the unique index on `client_request_id`.
- `insertReceipt` / `insertReceiptLines` — header plus ordered lines in a single multi-row insert.
- `applyStockMovement` — one conditional `UPDATE` per item; the returned row count *is* the success signal.
- `mapReceiptRow` — row → DTO, preferring the **snapshot** cashier name over the live join, so a renamed or deleted
  operator cannot rewrite yesterday's receipt.

### Layer 4 — the edge, and how failure reaches the cashier

`sale-actions.ts` validates the envelope-level input, calls `performCheckout`, and translates a `CheckoutError`
into `{ status, code, issues }`. The cashier page then does something specific with it:

- `409 INSUFFICIENT_STOCK` → the cart is **reconciled** against fresh catalog rows (`reconcileLines`), the offending
  quantities are clamped to what actually exists, and the affected lines are marked inline.
- `data.reused === true` → the panel says the sale was already recorded and shows the original receipt instead of a
  second confirmation.
- A dropped connection → the request id was kept in a ref, so retrying is safe by design, not by luck.

### Two cashiers, one store, same product

```
time   Cashier A                                   Cashier B
 │     POST checkout [pen ×2]                        │
 │  ── BEGIN                                        │
 │  ── idempotency: no row                          │
 │  ── SELECT pen FOR UPDATE  ◀── lock held         │
 │                                                  │  POST checkout [pen ×3]
 │                                                  │  ── BEGIN
 │                                                  │  ── SELECT pen FOR UPDATE (waits)
 │  ── stock = 5 ≥ 2 → insert receipt, stock 3      │
 │  ── COMMIT  ✔ receipt QS-…-7F3K                  │
 │                                                  │  ── lock granted, stock now 3
 │                                                  │  ── 3 ≥ 3 → insert receipt, stock 0  ✔
```

Now imagine a third request asking for four: it waits for the lock, reads `0`, and is refused with
`INSUFFICIENT_STOCK` **plus** the exact per-line reason — never a silent negative inventory.

### Invariants, and what enforces each one

| Invariant | Enforced by |
|---|---|
| A sale is recorded exactly once per `clientRequestId` | unique index + replay check |
| History and stock can never disagree | one transaction, rollback on any failure |
| Stock never goes negative | `FOR UPDATE` + conditional `UPDATE … WHERE stock >= qty` |
| Concurrent sales cannot deadlock | deterministic lock order (sorted ids) |
| Past receipts never change | name/price/discount/cashier snapshots on the lines and header |
| Receipt numbers are unique per store | unique index + bounded retry |
| Money never drifts | integer-cent arithmetic, `numeric(18,2)` at rest |
| The cart cannot be forged (price/stock) | server-side re-pricing from locked rows |

---

## 5. The voice-order pipeline

Voice is the feature with the worst failure modes if it is naive: a language model that "helpfully" invents a
product produces a receipt for something the store does not sell. So the pipeline is built as
**probabilistic in the middle, deterministic at both ends** — the LLM is never the source of truth.

```
 ① CAPTURE                    ② SERVE                        ③ INTERPRET              ④ MAP               ⑤ REVIEW
 Web Speech API  ──transcript──▶  Server Action  ──prompt──▶  OpenRouter  ──JSON──▶  pure mapping  ──lines──▶  human
 (no key, no upload)              session + sale:create        openrouter/free          catalog-bound          confirms
                                  catalog loaded here                                   or dropped
```

### ① Capture — the browser does the listening

`lib/quickstore/speech.ts` wraps the native `SpeechRecognition` / `webkitSpeechRecognition` API: **no npm package,
no API key, no audio ever leaves the device**, and `supported: false` is reported where the browser cannot do it
(so the mic disables itself instead of failing mysteriously). Two correctness details:

- The transcript is **rebuilt from the whole results snapshot** on every event, never appended — appending is what
  produces duplicated sentences when an engine re-delivers a result.
- `collapseRepeats` then removes the repetition that Chrome on Android *still* emits, so a single spoken
  "satu tahu" cannot arrive as "satu tahu satu tahu". `interimTail` keeps partial results from re-showing words
  that already settled.

The locale follows the selected language (`en-US` / `id-ID`), and `stop()` resolves with the final transcript once
the engine has flushed.

### ② Serve — identity and ground truth before any AI

`voice-actions.ts` performs the same guard chain as checkout (`currentSession()` → `sale:create`, since voice feeds
the cart), validates `language ∈ {EN, ID}` and the transcript type, clamps the transcript to
`VOICE_MAX_TRANSCRIPT_CHARS`, and rejects an empty one with `EMPTY_TRANSCRIPT`.

Then — and this is the important part — **the server loads the store catalog itself** and puts it in the prompt.
The client cannot dictate the catalog, and the model is therefore asked to choose from a known, closed list rather
than to guess product names.

### ③ Interpret — a strict contract with a free model

`lib/openrouter.ts` is a deliberately thin client: native `fetch`, ~40 lines, no SDK. The key is read **at call
time** so a missing key surfaces as a clear error instead of a silently broken client, and the model is
configurable (`OPEN_ROUTER_MODEL`, default `openrouter/free`) so the free router can be swapped for a paid model
without touching the pipeline.

`VOICE_ORDER_SYSTEM_PROMPT` does the heavy lifting: return JSON only, never invent products, read the **whole**
sentence instead of splitting it, allow one-word names, translations and slang, treat *to* / *for* as glue words
rather than numbers, and never send a real product to "unmatched" just because it appeared in plural.

Because a model can still wrap JSON in prose or fences, `extractJsonObject` pulls the first balanced object out of
the text before parsing — cheap, and it removes an entire class of "the model was fine, our parse was not" bugs.

### ④ Map — the model proposes, the domain disposes

`lib/quickstore/voice-order.ts` (~1 200 lines of pure functions) is where hallucination dies. Every function below
is deterministic and unit-tested, and every one of them exists because a real utterance broke a naive version:

| Guard | What it does | Example |
|---|---|---|
| `readSpokenQuantity` | digits, words, homophones, compounds, trailing `x3` — in **both** languages | `"dua"`→2 · `"nam"`→6 (from *enam*) · `"3"`→3 · `"x3"`→3 |
| `stripSpokenQuantity` | removes the number and unit words without eating the product | `"2 botol pens"` → `"pens"` |
| `translatePhrase` | glossary expansion for translation and slang | `"piscok"` → *pisang coklat*; `"fred rise"` → *fried rice* |
| `resolveCatalogItem` | **exact → containment → nearest assumption**, tolerant of plurals and small typos | `"pens"` → `Ballpoint Pen` |
| `scanPhraseForItems` | bounded sliding window (≤ 3 words, longest first) that rescues a whole failed sentence, skipping windows made only of numbers/units/filler | `"one potato to three pens and book"` → 3 lines |
| `quantityBeside` | takes the number *nearest* the matched product, inside it before it before after it | `"one potato to three pens"` → 1 and 3 |
| `mapVoiceOrderResult` | validates ids against the live catalog, merges duplicates, clamps to `MAX_QTY_PER_LINE`, drops rule-breaking lines | an invented `itemId` is simply gone |

Two design choices do most of the work:

- **An id the model made up is not a product.** Lines are re-resolved against the catalog rows the server sent, so
  a hallucinated name matching a real one still fails on the id, while a *real* product the model failed to
  resolve gets one last deterministic chance — because "the cashier said it out loud" is better evidence than a
  model's confidence score.
- **Honesty over silence.** Whatever cannot be mapped is returned in `unmatched[]` with the words that produced it,
  and the panel shows it. The cashier learns the catalog is missing that product instead of quietly
  under-charging a customer.

### ⑤ Review — the human is still the cashier

Nothing the pipeline returns touches the cart directly. The `VoiceOrder` panel renders the interpreted lines with
their `heard` phrase, confidence and a computed price (via the same `checkAvailability` the cart uses), lets the
cashier adjust quantities or drop lines, and only then calls `onAdd`. A bad transcript costs one tap, not one
wrong receipt.

### Worked examples (from the test suite)

| Spoken | Interpreted |
|---|---|
| `"tiga pensil, empat pena"` | 3 × *Pencil*, 4 × *Pen* |
| `"beli 2 sate dan satu soto"` | 2 × *Sate*, 1 × *Soto* |
| `"fred rise dua sama roll"` | 2 × *Nasi Goreng* (glossary), 1 × *Roll* |
| `"one potato to three pens and book"` | 1 × *Potato*, 3 × *Ballpoint Pen*, 1 × *Notebook* |
| `"piscok nam"` | 6 × *Pisang Coklat* (slang + homophone) |
| `"satu tahu satu tahu"` | 1 spoken phrase → **1** × *Tahu* (engine duplication collapsed) |

The suite (`tests/unit/voice-order.test.ts`, 25 cases) asserts exactly this behaviour — including that the prompt
forbids splitting a sentence, and that a product identity is never lost to a plural.

---

## 6. The analytics engine

The History tab must stay fast on a store with years of receipts, so **the browser never receives history** — it
receives one page of receipts plus an already-aggregated summary.

### Window semantics first

The operator picks a range in their own calendar (`today`, `7d`, `30d`, `month`, `all`, or `custom`), so the client
sends:

- local `YYYY-MM-DD` bounds, and
- its **UTC offset in minutes** (`tzOffset`).

`rangeInstants()` turns those days into instants where `from` is inclusive and `to` is the start of the next local
day (exclusive) — which keeps `paid_at >= from AND paid_at < to` a plain **index range scan** on
`(store_id, paid_at DESC)` instead of a function call per row.

`getStoreHistorySummary` then returns six parallel aggregations, all computed in SQL:

| Output | SQL shape |
|---|---|
| Totals per currency | `group by currency` with `coalesce(sum(total),0)::text` |
| Revenue series | `date_trunc(granularity, paid_at + tz_shift)` + `to_char` bucket keys |
| Hour-of-day curve | `extract(hour from paid_at + tz_shift)` |
| Top items | join to `qs_history_items`, `sum(line_total)`, `sum(quantity)` |
| Per cashier | grouped on the **snapshot** cashier name |
| Currency split | so a mixed catalog stays honest instead of pretending one total |

Three details worth calling out:

- **Buckets follow the operator's day**, not the database's. The UTC offset is clamped to the real-world range and
  inlined as `interval 'N minutes'` — inlined because Postgres only matches a `SELECT` expression against its
  `GROUP BY`/`ORDER BY` when both render identically, and a bound parameter (`$2` here, `$9` there) is not
  considered equal.
- **Granularity adapts to the window** — days ≤ 31, weeks ≤ 180, months beyond (and for "all time"), so a
  year-long chart is 12 buckets, not 365.
- **Voided sales never inflate anything.** They remain visible in the transaction list (`status: voided`) but are
  excluded from every aggregate, which is exactly what a shop owner expects when they refund something.

The dashboard itself is client-side and presentational (`history-charts.tsx`): shadcn `ChartContainer` + Recharts
for revenue, index-capped entrance animations that respect reduced motion, and native `<title>` tooltips so the
numbers stay reachable on touch as well as hover.

### Exports — the two files a shop actually needs

| Export | Format | Engineering notes |
|---|---|---|
| Whole filtered range | CSV | UTF-8 **BOM** (so Excel does not mangle accents), **CRLF**, quoting only when required, and a leading `=`/`+`/`-`/`@` neutralised so an item name can never become a spreadsheet formula |
| One receipt | CSV | the same writer, keyed to the receipt number |
| One receipt | PNG | canvas at 2× — the sheet is painted twice (a throwaway pass measures the height, the real pass draws it), so layout can never disagree with the measurement; always light "paper" ink even in dark mode |

---

## 7. Demo mode — the same UI, no server

`/demo` is not a mock-up: it renders the **production** `ProductSearch`, `VoiceOrder`, `SaleCart` and
`ReceiptPanel` components. What changes is what sits behind them:

- the catalog comes from `lib/demo/demo.ts` (bilingual sample data),
- stock is reduced in memory by `sellDemoStock`,
- the voice interpreter is a **local deterministic parser** whose raw answer is pushed through the **real**
  `mapVoiceOrderResult`,
- every network-shaped step awaits `waitForDemo()` so the genuine loading states ("Interpreting the order…",
  "Recording sale…") still appear.

Two properties fall out of that design: the demo cannot drift from production behaviour (it uses the same mapping
code and the same UI), and the demo page also demonstrates the exports — CSV and PNG — for the sale just made.
It lives outside the `(main)` route group on purpose, because that shell redirects guests.

---

## 8. The data layer

### Modelling decisions and their reasons

| Decision | Reason |
|---|---|
| `uuid` PKs with `defaultRandom()` | URL-safe, collision-free, generated in the database |
| Soft delete (`stores.deleted_at`) | History, items and members survive for audit and disputes; **every** read path filters it, so the store behaves as if it were gone |
| Snapshot columns (`qs_history_items.name/unit_price/…`, `qs_history.cashier_name`) | A receipt is a historical document: renaming a product or deleting an operator must not rewrite it |
| `numeric(18,2)` for money | Exact decimal arithmetic in Postgres; cents only in JS |
| Functional unique index `lower(name)` per store | "Apple" = "aPPle"; the rule lives in the database, so it also catches concurrent inserts |
| CHECK constraints (`stocks` 0–999 or NULL, `discount_percent` 0–100, `quantity > 0`) | The last line of defence — bad data cannot exist even if a future code path is careless |
| `client_request_id` unique | Turns retries into replays (the idempotency guarantee) |
| Denormalised `purchased_amount`, `line_count`, `item_count` | Reporting without expensive joins |
| `on delete set null` for authors/cashiers, `cascade` for owned rows | Deleting an account never blocks or destroys a store's business data |
| Indexes shaped per access path (`stores_user_idx`, `store_members_store_user_unique` + `user_idx`, `qs_history_store_paid_at_idx` DESC, `qs_history_cashier_idx`) | Every listing, membership lookup and history page is an index scan |
| 14 versioned migrations under `drizzle/` | The schema has a reviewable history, not just a current state |

### Connection handling

`lib/db/index.ts` builds **one** `pg.Pool` (`max: 10`) and caches it on `globalThis` outside production. That
matters under Next.js dev/HMR, where modules are re-evaluated constantly: without the cache every hot reload would
leak a pool and a serverless database would run out of connections. Serverless functions reuse the same pattern —
one pool per warm instance, released connections returned to the pool rather than reopened.

### Identity tables

NextAuth's Drizzle adapter owns `users`, `accounts`, `sessions` and `verification_tokens` (camelCase property names
are preserved because the adapter reads columns by name). Sessions are **JWT**-based (`strategy: "jwt"`), with two
small callbacks that make the rest of the app simpler: `jwt` persists the database user id into the token, and
`session` exposes it as `session.user.id` — the exact value `currentUserRole()` needs. Google is the only provider
(`openid email profile`, offline access, consent prompt).

---

## 9. Observability, security and resilience

### Sentry, wired for a real deployment

| Piece | Detail |
|---|---|
| `instrumentation.ts` | Imports the server or edge config per runtime, and exports `onRequestError = Sentry.captureRequestError` — so **server-side errors from Server Actions and route handlers are captured automatically** |
| `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` | One config per runtime, all three instrumented |
| `next.config.mjs` | `withSentryConfig` with a **tunnel route** (`/monitoring`), widened client uploads for readable stacks, and tree-shaken debug logging; source maps are uploaded during build |
| `app/global-error.tsx` | The App Router's last-resort boundary, so a render crash is a friendly screen and a Sentry event rather than a white page |

### Security posture, in one table

| Threat | Mitigation |
|---|---|
| Forged identity | Session cookie only; user id never taken from arguments |
| Privilege escalation | Matrix check inside every action; owner row immutable; no self-membership edits |
| Cross-tenant data access | Every query is `store_id`-scoped **after** a role check; unknown / forbidden answers are indistinguishable |
| Price or stock tampering | Server recomputes everything from locked rows |
| Double charging | Idempotency key + unique index |
| Oversized / malicious uploads | Browser check → Server Action re-check (2 MB, image-only) → Cloudinary `max_file_size` → `bodySizeLimit: '3mb'` as a framework backstop |
| Secret exposure | Cloudinary secret and OpenRouter key are server-only modules; the browser only ever sees the Cloudinary **cloud name** for image delivery |
| Internal error leakage | Every failure is translated to a user-safe sentence; details go to Sentry |
| SQL injection | Drizzle parameterises values; only reviewed, whitelisted identifiers (granularity, date format) are inlined as `sql.raw` |
| Malformed input reaching Postgres | `isUuid()` guards UUID comparisons; enums are parsed against whitelists; numbers are clamped |

### Resilience patterns used across the codebase

- **Fail loudly at the boundary, softly at the edge** — domain code throws typed errors; actions convert them into
  envelopes.
- **Optimistic UI is never trusted** — the cashier UI recomputes totals locally for speed, but the server's answer is
  what the receipt shows.
- **Idempotency everywhere a user can double-click** — checkout keys, the 3-second confirm lock, and revalidation on
  tab focus.
- **Degrade, do not disappear** — no Web Speech support disables the mic with an explanation; a voice provider
  outage returns a typed error the panel can show while the keyboard path keeps working.

---

## 10. Client architecture — theme, language, URL as state

- **Theme and language share one store.** `lib/preferences.ts` keeps both in `localStorage`, exposes them through
  `useSyncExternalStore` (so React state follows browser storage without effect hacks), re-applies them to `<html>`
  on every change **and** on cross-tab `storage` events, and provides `getServerSnapshot` defaults for SSR.
- **No flash of the wrong theme.** `app/layout.tsx` inlines a tiny blocking script that applies theme, colour scheme
  and `lang` before first paint.
- **Two-layer i18n.** Shell strings are keyed (`<T k="dash.title" />`); feature phrases use the English sentence as
  the key, so nothing can ever render as a raw key — worst case it simply stays English. Server messages are
  translated by `serverText()` on the client, which is what lets the actions keep speaking HTTP-era English.
- **The URL is state.** The open store tab (`?tab=`), the items filters/sort/page and the history range/filters all
  live in the query string, and the **same** parser is shared by the component and the action. A refresh, a
  back-button, or a pasted link reproduces the exact view — and the server and the client can never disagree about
  what was asked for.
- **Motion with a brake.** Every animated surface checks `useReducedMotion()` and collapses to a short, non-spatial
  transition.
- **Presentation primitives.** `components/ui/*` are shadcn components over Base UI primitives (accessible
  autocomplete, dialog, select, sheet, tabs, switch) — owned in-repo, so behaviour is inspectable and themable.

---

## 11. Testing and CI

The test strategy follows the layering: **mocks only at the boundary, real code everywhere else.**

| Suite | Cases | What it proves |
|---|:--:|---|
| `tests/unit/cashier.test.ts` | 46 | Integer-cents money, price-input validation, quantity/stock rules, search ranking, cart operations, and the full confirm state machine |
| `tests/unit/checkout.test.ts` | 26 | `performCheckout` against an in-memory port: idempotent replay, rollback on stock failure, totals, receipt helpers, resilience |
| `tests/unit/voice-order.test.ts` | 25 | Spoken numbers, homophones, plurals, glossary, rescue scan, hallucinated-id rejection, de-duplication, prompt guarantees |
| `tests/rbac/actions-rbac.test.ts` | 28 | Every guarded action across 7 personas: anonymous, guest, owner, admin, master, cross-store, unknown/soft-deleted store |
| `tests/rbac/permissions.test.ts` | 12 | The matrix itself, the composite helpers, and the named UI helpers |
| `tests/unit/item-list.test.ts` | 11 | Query parsing/clamping and URL round-trips against the shared parser |
| `tests/unit/speech.test.ts` | 10 | `collapseRepeats` / `interimTail` against real engine duplication cases |
| `tests/rbac/store-tabs.test.ts` | 9 | Which tabs a role may open, and whether the URL can smuggle a forbidden one |
| `tests/unit/ids-utils.test.ts` | 3 | UUID guards and the class-name helper |
| **Total** | **170** | |

`jest.config.js` mirrors the `@/*` alias via `moduleNameMapper` and compiles the sources with ts-jest in CommonJS,
so the app's ESM-style TypeScript loads in Jest unchanged — no duplicated type shims, no build step before tests.

### CI as four readable signals

`.github/workflows/tests.yml` runs on every push and pull request as **four independent jobs** — `lint`, `build`,
`unit test`, `RBAC test` — each on its own runner with a 15-minute timeout. They were deliberately split from one
job with four steps, where the first failure hid the rest: now each check reports its own status and can be
required or re-run individually in branch protection. Job-level placeholder environment values mean no CI run ever
touches a real database.

---

## 12. Trade-offs and roadmap

Every system is a set of decisions, and these are the ones worth naming out loud:

| Decision | Why | Cost / next step |
|---|---|---|
| **JWT sessions** instead of database sessions | One fewer query per action, stateless server | Revoking a single session is not instant → move to adapter sessions with a session table if that becomes a requirement |
| **Client-side autocomplete ranking** with a 3-row cap | Instant typing feedback; the whole catalog is already in memory for the cashier | Large catalogs (> ~5 000 items) should push search into SQL with a `trigram` index |
| **Offset-based pagination** for items and history | Simple, index-friendly, and the UI already exposes page numbers | Cursor pagination if a single store ever needs to scan hundreds of thousands of rows |
| **`openrouter/free` by default** | Zero cost, and the pipeline treats the model as replaceable | Swap `OPEN_ROUTER_MODEL` for a paid model to raise accuracy — no code change |
| **Soft delete on stores only** | Members and items must stay hard-deletable for data hygiene | Extend the marker to items if per-item audit becomes necessary |
| **`sale:void` reserved, not shipped** | The enum, permission and status column exist so refunds are additive | Ship the void flow (audit trail, stock reversal) as the next feature |
| **Declared-but-unused dependencies** (`better-auth`, `next-cloudinary`, `qrcode`, `jsqr`, `@vercel/analytics`) | Explored during spikes; Cloudinary and voice were ultimately implemented server-side and dependency-free | Prune them in a hygiene pass — recorded here rather than quietly left in `package.json` |

### What would come next

1. **Refunds / void** — the schema is already shaped for it (`sale:void`, `qs_sale_status.voided`).
2. **Modern POS** — the parked `/pos` surface: table layout, kitchen display, order lifecycle.
3. **Offline-tolerant cashier** — queue sales locally and replay them; the idempotency key makes this a bounded
   problem rather than a redesign.
4. **Receipt printing / sharing** — the PNG export is the first step towards ESC/POS and share sheets.
5. **Per-member permission overrides** — a table layered onto the existing matrix, no call-site changes.

<p align="center">
  <sub>Back to <a href="../README.md">README</a> · see also <a href="./Overall.md">Overall.md</a></sub>
</p>
