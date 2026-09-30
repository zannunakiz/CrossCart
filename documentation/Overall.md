# CrossCart — Overall Documentation

<p align="center">
  <img src="../public/logo.png" width="120" alt="CrossCart" />
</p>

<p align="center">
  <b>The quiet system behind busy businesses.</b><br/>
  A free, server-first <b>POS &amp; micro-store platform</b>: sell, track stock, run a team, and read your own numbers<br/>
  inside a single Next.js application backed by Neon Postgres.
</p>

> Companion documents: [`Engineering.md`](./Engineering.md) (deep dive into the transaction engine, RBAC, voice
> pipeline and flow system) · [`../README.md`](../README.md) (project overview).

---

## Table of Contents

1. [What CrossCart is](#1-what-crosscart-is)
2. [Tech stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Feature catalogue](#4-feature-catalogue)
5. [Data model](#5-data-model)
6. [Access control model](#6-access-control-model)
7. [Domain rules and invariants](#7-domain-rules-and-invariants)
8. [Integrations](#8-integrations)
9. [Testing](#9-testing)
10. [CI/CD and deployment](#10-cicd-and-deployment)
11. [Observability and security](#11-observability-and-security)
12. [Internationalisation, theming and UX](#12-internationalisation-theming-and-ux)
13. [Codebase conventions](#13-codebase-conventions)
14. [Dependency inventory](#14-dependency-inventory)
15. [Documentation index](#15-documentation-index)

---

## 1. What CrossCart is

CrossCart is the operating system for a small business that does not want POS software.

A store is created in one dialog, becomes `open` or `closed` with a single switch, and instantly has a **catalog**,
a **cashier**, a **revenue dashboard**, a **team with real roles** and a **payment QR** for the customer to scan.
Every business operation — an item, a sale, a membership, a setting — is one Server Action away, guarded by the same
permission matrix, rendered on the page the user is already looking at.

### Surfaces

| Surface | Entry point | Description |
|---|---|---|
| **Landing & auth** | `/` | Product narrative, Google sign-in, theme/language switches, a "today at a glance" pulse, and the demo entry point |
| **Dashboard** | `/dashboard` | Workspace picker: QuickStore (live) and Modern POS (coming soon) |
| **QuickStore** | `/quickstore` | The store list — create, open/close indicator, jump into a store |
| **Store detail** | `/quickstore/[storeId]?tab=…` | Four tabs: **Store** (settings), **Items** (catalog), **History** (analytics), **Members** (team) |
| **Cashier** | `/quickstore/[storeId]/cashier` | Search or speak an order → review → confirm with a locked countdown → receipt |
| **Demo Cashier** | `/demo` | The full cashier UI for guests: mocked catalog, no server, dual tabs (cashier + items) |
| **Modern POS** | `/pos` | Deliberately parked roadmap surface (restaurant-grade register + KDS) |
| **Error surfaces** | `not-found.tsx`, `global-error.tsx` | A branded 404 with a redirect countdown, and a Sentry-aware global error boundary |

### Who it is for

- **Single-operator micro-shops** — one person, one catalog, a QR code and a phone.
- **Small teams** — an owner plus staff, where the staff may sell and manage the catalog but not change the
  payment credential or the member list.
- **Anyone curious how it is built** — the `/demo` surface requires no account, and the code is documented inline.

---

## 2. Tech stack

### Runtime and framework

| Technology | Version | Role |
|---|---|---|
| Next.js | 16.3.3 | App Router, Server Components, Server Actions, route groups, `next/font`, `next/image` |
| React | 19.2.4 | UI runtime, `useSyncExternalStore`, Suspense, `useReducer` |
| TypeScript | 5.7.3 | Strict typing end to end (schema → domain → UI) |
| Node.js | 22+ | Local dev, CI, production runtime |

### Frontend

| Technology | Role |
|---|---|
| Tailwind CSS 4 (`@tailwindcss/postcss`) | Utility-first styling driven by CSS custom properties (light/dark themes) |
| `tw-animate-css` | Animation utilities alongside Framer Motion |
| shadcn/ui (`base-nova` style) | Owned component layer (`components/ui/*`) |
| `@base-ui/react` | Accessible primitives behind the shadcn components (autocomplete, dialog, select, sheet, tabs, switch, breadcrumb, badge) |
| `clsx` + `tailwind-merge` (via `cn`) | Conditional class composition without conflicts |
| `lucide-react` | Icon set |
| `framer-motion` | Entrance choreography, all reduced-motion aware |
| `recharts` (+ shadcn chart wrapper) | Revenue and volume charts |
| `sonner` | Toasts |
| `next/font` | Inter (sans), JetBrains Mono (mono), Source Serif 4 (serif) — self-hosted |

### Data, identity and platform

| Technology | Role |
|---|---|
| Neon Postgres | Serverless Postgres database |
| Drizzle ORM 0.45 + `drizzle-kit` | Typed schema, relational queries (`db.query … with`), 14 migrations |
| `pg` (`Pool`, max 10) | Connection pooling, globally cached across HMR |
| NextAuth 4 + `@auth/drizzle-adapter` | Google OAuth, JWT sessions, Drizzle-backed user tables |
| OpenRouter (`openrouter/free`) | Voice-order interpretation (native `fetch`, no SDK) |
| Cloudinary 2 | Signed server-side upload of store payment QR images |
| Sentry (`@sentry/nextjs` 11) | Error monitoring across client, server and edge runtimes |

### Quality

| Technology | Role |
|---|---|
| Jest 30 + ts-jest | 9 suites / 170 cases — pure domain and RBAC tests |
| ESLint 9 (flat config) + `eslint-config-next` | Lint gate |
| GitHub Actions | Four parallel CI jobs: `lint`, `build`, `unit test`, `RBAC test` |
| `drizzle-kit` + `dotenv` | Migration generation/apply from `.env.local` |

---

## 3. Architecture

### Directory map

```
app/
├── (main)/                     Route group with the authenticated shell
│   ├── layout.tsx              getServerSession → redirect("/") for guests; navbar + sidebar + providers
│   ├── dashboard/              Workspace picker (PrimaryNav)
│   └── quickstore/
│       ├── page.tsx            Store list + create-store dialog
│       └── [storeId]/
│           ├── page.tsx        Tab shell (?tab=store|items|history|members) + URL sync
│           └── cashier/        Search · voice · cart · receipt
├── api/auth/[...nextauth]/     The single route handler in the app
├── demo/                       Guest-playable cashier (no session, no database)
├── pos/                        Parked Modern POS surface
├── layout.tsx                  Fonts, metadata, blocking theme script, providers
├── global-error.tsx            Global error boundary wired to Sentry
├── not-found.tsx               Branded 404 with redirect countdown
└── globals.css                 Tailwind 4 entry + theme tokens

lib/
├── actions/                    Server Actions (the only data entry points)
│   ├── context.ts              currentSession()
│   ├── result.ts               ok() / fail() envelope
│   ├── serialize.ts            jsonSafe() wire-format stability
│   └── store · item · member · sale · voice · history · upload actions
├── quickstore/                 PURE domain logic (no Next.js, no DB)
│   ├── cashier.ts              money, cart, availability, ranking, confirm state machine
│   ├── checkout.ts             performCheckout rules + typed CheckoutError
│   ├── checkout-drizzle.ts     the only sale SQL (implements the checkout port)
│   ├── voice-order.ts          prompt, parsing, glossary, catalog resolution, mapping
│   ├── speech.ts               Web Speech API hook + transcript de-duplication
│   ├── history.ts              range/preset parsing, instants, labels
│   ├── item-list.ts            filter/sort/page state + URL sync
│   ├── csv.ts                  CSV writer (BOM, CRLF, formula disarming)
│   ├── receipt-image.ts        canvas PNG receipt renderer
│   ├── permissions.ts          the RBAC matrix
│   ├── store-tabs.ts           tab definitions + permission gating
│   ├── upload.ts               QR upload rules shared by browser and server
│   ├── queries.ts              server-side query helpers (role, pages, aggregations)
│   └── ids.ts, utils.ts        UUID guard, `cn`
├── db/
│   ├── schema.ts               Drizzle schema, enums, indexes, relations, inferred types
│   └── index.ts                pooled client (global-cached)
├── demo/demo.ts                Offline doubles for /demo
├── auth.ts, openrouter.ts, cloudinary.ts
├── i18n.ts                     EN/ID dictionaries + serverText()
├── preferences.ts              theme + language store (useSyncExternalStore)
└── utils.ts

components/
├── main-navbar · main-sidebar · main-sidebar-context · providers · t
├── user-avatar · brand-icons · auth-buttons · pos-coming-soon
├── dashboard/primary-nav
├── quickstore/                 store tabs, dialogs, cashier parts, charts, header context
├── demo/demo-items-tab
└── ui/                         shadcn primitives (autocomplete, badge, breadcrumb, button, card,
                                chart, dialog, input, label, select, separator, sheet, switch,
                                tab-nav, table, tabs, textarea, toast)

drizzle/                        14 SQL migrations + snapshots (0000 … 0013)
tests/                          unit/ (6 suites) + rbac/ (3 suites)
scripts/db-clear.mjs            Local data reset helper
documentation/                  Overall.md · Engineering.md · architecture images
```

### Request flow

```
1. Browser renders a Server Component (or hydrates a Client Component).
2. A user action calls a Server Action in lib/actions/** with the session cookie attached.
3. The action: currentSession() → getUserRole() → hasPermission() → input validation.
4. Pure domain logic in lib/quickstore/** computes the answer (no framework, no SQL).
5. The Drizzle adapter reads/writes Neon Postgres inside a transaction where atomicity is required.
6. The action answers a typed envelope { ok, data } | { ok: false, error, status?, code?, issues? }.
7. The client renders, toasts, or reconciles its state — translating messages through serverText().
```

### Architectural rules

| Rule | Rationale |
|---|---|
| No data access from a Client Component | Client Components call actions; actions are the trust boundary |
| Domain logic is framework-free | Testability without a runtime; reuse across app, demo and tests |
| One SQL module per aggregate | Checkout SQL lives only in `checkout-drizzle.ts`; generic queries in `queries.ts` |
| Shared parsers, not parallel implementations | URL state, upload rules and limits are parsed by the same functions on both sides |
| Constraints live in the database | Uniqueness, ranges and integrity can never depend on a UI |

---

## 4. Feature catalogue

### 4.1 Authentication and shell

| Feature | Detail |
|---|---|
| Sign-in | Google OAuth via NextAuth; the database user id is persisted into the JWT and exposed on the session |
| Session gate | `(main)/layout.tsx` calls `getServerSession` and redirects guests to `/` — the protected shell never renders without a session |
| Navbar | Breadcrumb (store name + tab context), theme switch, language switch, avatar |
| Sidebar | App navigation (Dashboard, Quick Store), plus a **store group** that appears on any `/quickstore/[storeId]` route with its permitted tabs and an "open cashier in a new tab" action |
| Providers | `SessionProvider` + Sonner toaster |
| Theme | Dark/light stored in `localStorage`, applied before first paint by a blocking script, toggled from navbar, sidebar or landing page |
| Language | EN / ID across the shell, feature pages and server messages |

### 4.2 Store list (`/quickstore`)

- Lists the stores the caller **owns** and the stores they are a **member** of — merged and de-duplicated, newest
  first, soft-deleted stores excluded.
- Create-store dialog: `name` required and ≤ 20 characters, `description` ≤ 50 (validated in the form, the action
  **and** the database column), optional open/closed state.
- Each card shows status, description and an entry link; failures surface as a translated toast rather than a crash.

### 4.3 Store tab — Settings

| Field | Who may change it | Notes |
|---|---|---|
| Name, description | `store:update-details` (master) | Field-level disabled states for other roles |
| Open / closed | `store:update-status` (master, admin) | Reflected immediately in the status line and the cashier |
| Payment QR | `store:update-credential` (master) | Signed Cloudinary upload: 2 MB / image-only, validated in the browser and again in the action |
| Delete store | `store:delete` (master) or the owner | Inline two-step confirm; soft delete, so history survives |

### 4.4 Items tab — the catalog

| Capability | Detail |
|---|---|
| Create / edit / delete | `item:create` / `item:update` / `item:delete` (master, admin) via a dialog with live validation |
| Fields | Name (≤ 20), description (≤ 50), price (whole numbers, up to 12 digits), discount 0–100 %, stock 0–999 or blank = unlimited, available toggle |
| Uniqueness | Names are unique per store **case-insensitively** — enforced by a functional index, and surfaced as "An item with this name already exists" |
| Search & filter | Free-text search over name + description, availability filter (all / available / unavailable) |
| Sort | Name, price, stock, sold (`purchased_amount`), newest — a whitelist, so the client can never order by raw SQL |
| Paging | SQL-side paging with page sizes 10 / 25 / 50 and a total count |
| URL state | Tab, search, filter, sort, direction, page and page size live in the query string and survive refresh or sharing |
| Derived columns | Payable price after discount, sold counter, stock badge |

### 4.5 History tab — analytics and receipts

| Capability | Detail |
|---|---|
| Range | `today`, `7d`, `30d`, `month`, `all`, and `custom` with two local calendar days (auto-swapped when reversed) |
| Filters | Status (all / completed / voided) and free-text search over receipt number, cashier and item names |
| KPIs | Revenue, sales, items sold, discounts — computed in SQL for the selected window |
| Charts | Revenue series with adaptive buckets (day / week / month) and an hour-of-day distribution; both follow the operator's timezone |
| Ranked lists | Top items (revenue, quantity) and per-cashier performance, from snapshot data |
| Receipt list | Paged, each row expanding to its lines with per-line discount and totals |
| Exports | Whole filtered range → CSV; single receipt → CSV or PNG |
| Precision | Money arrives as `numeric` strings, is formatted per currency, and never round-trips through a float |

### 4.6 Members tab — the team

| Capability | Permission | Notes |
|---|---|---|
| View the team | `member:view` | The owner always appears first, flagged `isOwner` (real row or synthetic), so that row can never be re-roled or removed |
| Invite | `member:invite` | By email; must be an existing user. Already a member → `409`, no such user → `404`, inviting yourself → refused |
| Change role | `member:update-role` | Master / admin; masters sort above admins, then by join date |
| Remove | `member:remove` | Members only — the owner is untouchable |
| Guard rails | — | No one may change their own membership; membership changes record `invitedBy` and `updatedAt` for a small audit trail |

### 4.7 Cashier (`/quickstore/[storeId]/cashier`)

A single screen, three ways in:

| Path | Detail |
|---|---|
| **Search** | Autocomplete over the catalog, ranked client-side, max 3 suggestions, showing the payable price after discount; unsellable products are listed with the reason but cannot be selected |
| **Voice** | Mic → transcript (EN/ID) → interpreted lines in a review panel (see `Engineering.md` §5) |
| **Cart** | Quantity steppers, per-line warnings for unavailable / short-stocked products, line totals, clear-cart |

Then the receipt panel: a **3-second locked confirm** (anti-double-tap), the store's payment QR for the customer,
the running subtotal / discount / total, an optional note, a submitting state, and — once recorded — the receipt
itself with the `reused` replay notice when the same request was retried.

Supporting behaviours:

- The catalog is re-fetchable, and a `409` from the server triggers a **reconcile** that clamps cart quantities to
  what actually exists and marks the affected lines.
- The store status line makes it obvious when a store is closed, and the route reflects that store state.
- Required permission: `sale:create` (master, admin). A guest reaching the URL is sent back.

### 4.8 Demo (`/demo`)

The production cashier components rendered against `lib/demo/demo.ts`:

- bilingual fixed catalog, in-memory stock, simulated latency so the real loading states appear;
- a deterministic local voice parser whose output is pushed through the **real** `mapVoiceOrderResult`;
- tabs for **Cashier** and **Items**, theme/language switches, and CSV + PNG export of the sale just made;
- no account, no Server Action call, no database — deliberately outside the `(main)` shell because guests must be
  able to open it.

### 4.9 Landing page and error surfaces

| Surface | Content |
|---|---|
| `/` | Hero with animated sections, product narrative, feature proof points, "today at a glance" pulse, Google sign-in / dashboard link, demo entry, footer with theme and language controls |
| `not-found.tsx` | Branded 404 with a redirect countdown back to the landing page |
| `global-error.tsx` | Last-resort error boundary, so a render crash is a friendly screen and a Sentry event |
| `/pos` | A "coming soon" surface that keeps the roadmap visible without pretending it works |

---

## 5. Data model

All tables are defined in `lib/db/schema.ts` with Drizzle and applied through 14 versioned migrations in
`drizzle/`.

### 5.1 Entity relationships

```
users ──┬──< accounts                    (NextAuth OAuth accounts)
        ├──< sessions                    (NextAuth session rows)
        ├──< stores            (owner)   ──┬──< store_members ──> users (member, invited_by)
        │                                  ├──< store_items   ──> users (creator)
        │                                  └──< qs_history    ──> users (cashier, snapshot name)
        │                                        └──< qs_history_items ──> store_items (nullable)

health_checks                             (liveness probe table)
verification_tokens                       (NextAuth email flows)
```

### 5.2 Tables

**`users`** — NextAuth user: `id` (uuid text), `name`, `email` (unique), `email_verified`, `image`.

**`accounts`** — provider link: `user_id` FK cascade, `provider` + `provider_account_id` (unique together), tokens
and expiry columns.

**`sessions`** — `session_token` (PK), `user_id` FK cascade, `expires`. Kept even though sessions are JWT-based, so
switching strategy later is a config change rather than a migration.

**`verification_tokens`** — `identifier` + `token` (unique together), `expires`.

**`stores`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `user_id` | text FK → users | Owner; cascade delete |
| `name` | varchar(20) | Required, length enforced by the type |
| `description` | varchar(50) | Optional |
| `open` | boolean | Accepting orders or not |
| `payment_qr` | text | Cloudinary secure URL |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | Soft delete; every read path filters it |

Indexes: `stores_user_idx` (owner listings), `stores_deleted_idx` (visibility filtering).

**`store_members`**

| Column | Type | Notes |
|---|---|---|
| `store_id` / `user_id` | uuid / text FK | Cascade on delete |
| `role` | `store_role` enum | `master` \| `admin`, default `admin` |
| `invited_by` | text FK → users | `set null` on delete; audit trail |
| `created_at` / `updated_at` | timestamptz | joined / last role change |

Indexes: `store_members_store_user_unique` (one role per user per store), `store_members_user_idx` (the reverse
direction: "stores I belong to").

**`store_items`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `store_id` | uuid FK | Cascade |
| `user_id` | text FK | Creator, `set null` on account deletion |
| `name` / `description` | varchar(20) / varchar(50) | |
| `price` | numeric(18,2) | Default 0 |
| `available` | boolean | Sellable or not |
| `stocks` | integer | `NULL` = unlimited; CHECK 0–999 |
| `discount_percent` | integer | CHECK 0–100 |
| `purchased_amount` | integer | Denormalised units sold |
| `created_at` / `updated_at` | timestamptz | |

Indexes and constraints: `store_items_store_idx`, **`store_items_store_name_unique` on `(store_id, lower(name))`**
(case-insensitive uniqueness per store), CHECKs for stock range and discount range.

**`qs_history`** (sale header)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `store_id` | uuid FK | Cascade |
| `cashier_id` | text FK → users | `set null` on delete |
| `cashier_name` | varchar(80) | **Snapshot** so receipts survive account deletion or renaming |
| `receipt_number` | varchar(24) | e.g. `QS-20260926-7F3K` |
| `status` | `qs_sale_status` | `completed` \| `voided` (voided reserved for refunds) |
| `currency` | `currency_type` | `USD` \| `IDR`; one sale never mixes currencies |
| `subtotal`, `discount_total`, `total` | numeric(18,2) | |
| `line_count`, `item_count` | integer | Distinct lines / total units (denormalised for reporting) |
| `note` | varchar(140) | Optional cashier note |
| `client_request_id` | varchar(64) | **Idempotency key**, unique |
| `paid_at` / `created_at` | timestamptz | |

Indexes: `qs_history_store_receipt_unique` (per-store receipt numbers), `qs_history_client_request_unique`
(idempotency), `qs_history_store_paid_at_idx` on `(store_id, paid_at DESC)` (the dashboard access path),
`qs_history_cashier_idx`.

**`qs_history_items`** (sale lines)

| Column | Type | Notes |
|---|---|---|
| `history_id` | uuid FK | Cascade |
| `item_id` | uuid FK → store_items | **Nullable**, `set null` — deleting an item never destroys a receipt |
| `name`, `unit_price`, `discount_percent`, `unit_price_paid` | snapshot | Name varchar(20), money numeric(18,2) |
| `quantity` | integer | CHECK > 0 |
| `line_total` | numeric(18,2) | `unit_price_paid × quantity` |
| `position` | integer | Print order on the receipt |
| `created_at` | timestamptz | |

Indexes: `qs_history_items_history_idx`, `qs_history_items_item_idx`, CHECK `quantity > 0`.

**`health_checks`** — identity PK, `status`, `created_at`: a trivial table used as a connectivity probe.

### 5.3 Enums

| Enum | Values | Purpose |
|---|---|---|
| `store_role` | `master`, `admin` | Extensible — a future `viewer`/`staff` role is a migration plus a matrix edit |
| `currency_type` | `USD`, `IDR` | Per-sale currency, so mixed catalogs stay honest in reporting |
| `qs_sale_status` | `completed`, `voided` | Voided is reserved so refunds are additive, not a schema break |

### 5.4 Type safety

Every table exports inferred types (`Store`, `NewStore`, `StoreItem`, `QsHistory`, `QsHistoryItem`, `StoreRole`,
`CurrencyType`, `QsSaleStatus`) and Drizzle relations for `db.query … with`, so joins are typed and the UI never
re-declares a shape that the database already describes.

---

## 6. Access control model

CrossCart is a multi-tenant system where a user may own one store, administer another, and be a stranger to a
third — so authorization is expressed as **capabilities**, never as role name comparisons.

### Roles

| Role | Who holds it | Intent |
|---|---|---|
| **Master** | The store owner (implicit) and invited masters | Full control: store details, payment credential, membership, deletion |
| **Admin** | Invited staff | Runs the day-to-day store: catalog, cashier, open/close |
| **Guest** | Any signed-in non-member | Nothing — a store they do not belong to behaves as if it does not exist |

### Permission matrix (16 permissions)

| Area | Permission | Master | Admin |
|---|---|:--:|:--:|
| Store | `store:view` | ✅ | ✅ |
| Store | `store:update-details` | ✅ | ❌ |
| Store | `store:update-status` | ✅ | ✅ |
| Store | `store:update-credential` | ✅ | ❌ |
| Store | `store:delete` | ✅ | ❌ |
| Members | `member:view` | ✅ | ✅ |
| Members | `member:invite` | ✅ | ❌ |
| Members | `member:update-role` | ✅ | ❌ |
| Members | `member:remove` | ✅ | ❌ |
| Items | `item:view` / `item:create` / `item:update` / `item:delete` | ✅ | ✅ |
| Sales | `sale:view` / `sale:create` | ✅ | ✅ |
| Sales | `sale:void` | ✅ | ❌ |

### Enforcement

1. **Server** — every Server Action runs `currentSession()` → `getUserRole()` → `hasPermission()` before any data
   access. Nothing about the caller comes from the request body.
2. **UI** — tabs, buttons and fields render against the same helpers (`canCreateSale`, `canManageItems`, …), so a
   user never sees a control that would be refused.
3. **URL** — the tab strip (`?tab=…`) is validated with the same gating map, and an unauthorized or unknown tab is
   rewritten in the address bar.

Additional invariants: the owner row cannot be re-roled or removed, nobody may change their own membership,
memberships record who invited whom, and unknown / forbidden / soft-deleted / malformed store ids all produce the
same safe answers.

> Design rationale, extension recipe and the failure modes each rule prevents: [`Engineering.md` §3](./Engineering.md#3-scalable-rbac--permissions-not-roles).

---

## 7. Domain rules and invariants

| # | Invariant | Enforced by |
|---|---|---|
| 1 | A sale is recorded exactly once per `clientRequestId` | Unique index + replay check inside the transaction |
| 2 | History and stock change together or not at all | Single transaction, rollback on any failure |
| 3 | Stock can never go negative (and `NULL` means unlimited) | `FOR UPDATE` lock + conditional `UPDATE … WHERE stock >= qty` |
| 4 | Concurrent checkouts cannot deadlock | Deterministic lock order (ids sorted before locking) |
| 5 | Prices and totals are server-computed | Re-pricing from locked rows; the client sends ids and quantities only |
| 6 | Money never drifts | Integer cents in JS, `numeric(18,2)` at rest |
| 7 | Past receipts are immutable | Snapshot name / price / discount / cashier name on history rows |
| 8 | Item names are unique per store, case-insensitively | Functional unique index on `(store_id, lower(name))` |
| 9 | Discounts are 0–100 %, stock is 0–999, sold quantity > 0 | Database CHECK constraints |
| 10 | A user has at most one role per store | Unique index on `(store_id, user_id)` |
| 11 | Receipt numbers are unique per store | Unique index + bounded retry on collision |
| 12 | A deleted store disappears from every path | Soft-delete filter centralised in the role/query helpers |
| 13 | A signed-out or foreign caller reads nothing | Session + role + permission checks on every action |
| 14 | Users only ever see user-safe messages | Translated error text; internals go to Sentry |
| 15 | Uploads are images ≤ 2 MB | Browser check, action re-check, Cloudinary limit, body-size backstop |
| 16 | The voice model cannot invent a product | Catalog-bound mapping; unknown ids are dropped |
| 17 | A voice line never enters the cart unconfirmed | Human review panel before `onAdd` |
| 18 | Analytics never include voided sales | `status = 'completed'` in every aggregate |
| 19 | Charts follow the operator's timezone | Client `tzOffset` applied inside the SQL bucket expression |
| 20 | Views are reproducible | Tab, filters, sort and paging live in the URL and share one parser |

---

## 8. Integrations

### Google OAuth (NextAuth)

Scopes `openid email profile`, offline access and a consent prompt; the Drizzle adapter persists users, accounts and
verification tokens. The JWT carries the database user id, which every action reads.

### OpenRouter (voice)

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions` via native `fetch` (no SDK).
- Default model: `openrouter/free` (the zero-cost models router), overridable per environment.
- The key is read at call time and never leaves the server; `X-Title` and `HTTP-Referer` are sent for attribution.
- The response is parsed defensively (`extractJsonObject`) and validated against the live catalog before use.

### Cloudinary (payment QR)

- Upload path: browser validates the file → `uploadStoreQr` Server Action re-validates → signed upload with the API
  secret server-side → the `secure_url` is stored on the store row.
- The browser only knows the cloud name (used for delivery), never the key or secret.
- Failure is non-destructive: no upload, no database mutation.

### Sentry

Client, server and edge configs plus `onRequestError` for App Router errors, a first-party tunnel route
(`/monitoring`) so ad-blockers cannot silence reporting, source maps uploaded at build time, and debug logging
tree-shaken out of production bundles.

---

## 9. Testing

**Strategy:** mocks only at the boundary (the database port, the session), real code everywhere else. Nothing is
mocked that could be executed — which is only possible because the domain modules have no framework dependencies.

| Suite | Cases | Coverage focus |
|---|:--:|---|
| `tests/unit/cashier.test.ts` | 46 | Money (integer cents), price input validation, quantity clamping, stock availability, `rankItems` search ranking, cart add/update/remove/reconcile, `checkoutReducer` state machine, error-code → status mapping |
| `tests/unit/checkout.test.ts` | 26 | `normalizeCheckoutInput`, `prepareCheckoutLines`, totals, receipt helpers, `performCheckout` against an in-memory port (idempotent replay, rollback, stock movement, resilience) |
| `tests/unit/voice-order.test.ts` | 25 | Spoken quantities (digits, words, homophones, compounds), quantity stripping, partial names, plurals, typos, glossary/translation, slang, `assumeCatalogItem`, `mapVoiceOrderResult`, prompt guarantees |
| `tests/rbac/actions-rbac.test.ts` | 28 | Every guarded action as: signed-out, guest, owner, admin, master, cross-store caller, and against an unknown/soft-deleted/malformed store |
| `tests/rbac/permissions.test.ts` | 12 | The matrix itself, `hasAnyPermission` / `hasAllPermissions`, named helpers |
| `tests/unit/item-list.test.ts` | 11 | Query parsing and clamping, URL round-trips, default suppression |
| `tests/unit/speech.test.ts` | 10 | `collapseRepeats` and `interimTail` against real-duplication transcripts |
| `tests/rbac/store-tabs.test.ts` | 9 | Allowed tabs per role, tab parsing/resolution, URL param building |
| `tests/unit/ids-utils.test.ts` | 3 | `isUuid` guards and the `cn` helper |
| **Total** | **170** | |

**Runner configuration** (`jest.config.js`): ts-jest preset, `testEnvironment: "node"`, roots in `tests/`, and a
`moduleNameMapper` that mirrors the `@/*` alias, with a CommonJS tsconfig override so the app's ESM-style
TypeScript loads without a build step. `clearMocks` keeps suites independent.

**Commands**

```bash
npm run test:unit     # domain suites
npm run test:rbac     # permission matrix + guarded actions
```

Both run offline — no database, no network, no environment secrets.

---

## 10. CI/CD and deployment

### GitHub Actions (`.github/workflows/tests.yml`)

Runs on every `push` and `pull_request` as **four independent jobs**, each on a fresh `ubuntu-latest` runner with a
15-minute timeout and npm caching:

| Job | Command | Purpose |
|---|---|---|
| `TESTS / lint` | `npm run lint` | ESLint 9 flat config + `eslint-config-next` |
| `TESTS / build` | `npm run build` | Production compilation, catches type and App Router issues |
| `TESTS / unit test` | `npm run test:unit` | Domain logic |
| `TESTS / RBAC test` | `npm run test:rbac` | Authorization behaviour |

They were previously steps of a single job, where the first failure prevented the rest from reporting; as separate
jobs each check is individually visible, individually required in branch protection, and individually re-runnable.
Placeholder environment values are injected at workflow level so the build never needs real credentials and no job
touches a database.

### Deployment shape

The application is a standard Next.js deployment (Vercel-friendly — no custom server, no filesystem writes), with
external services configured per environment:

| Concern | Service | Notes |
|---|---|---|
| Hosting | Node.js 22 environment | `next build` + `next start` |
| Database | Neon Postgres | Pooled connection string; migrations applied with `drizzle-kit` |
| Auth | Google OAuth client | Redirect URLs per environment |
| Media | Cloudinary | Cloud name public; key/secret server-side |
| AI | OpenRouter | Key server-side; model selectable |
| Monitoring | Sentry | Source maps uploaded during build |

Environment variables are documented inline in [`.env.example`](../.env.example); no secret is ever committed.

---

## 11. Observability and security

### Observability

| Layer | Implementation |
|---|---|
| Client | `instrumentation-client.ts` + Sentry browser SDK |
| Server | `sentry.server.config.ts`, imported by `instrumentation.ts` per runtime |
| Edge | `sentry.edge.config.ts` |
| App Router errors | `onRequestError = Sentry.captureRequestError` (Server Actions included) |
| Render crashes | `app/global-error.tsx` |
| Transport | Tunnel route `/monitoring` so ad-blockers cannot suppress events |
| Build | Source maps uploaded by `withSentryConfig`; debug logging tree-shaken in production |

### Security controls

| Area | Control |
|---|---|
| Identity | NextAuth JWT sessions; user id from the verified cookie only |
| Authorization | Permission matrix checked inside every action, plus UI and URL gating |
| Tenant isolation | Every query is store-scoped after a role check; forbidden and missing are indistinguishable |
| Input validation | Field-level limits, whitelisted sort keys and enum values, clamped numbers, UUID guards |
| Integrity | Transactions, `FOR UPDATE` locks, conditional updates, unique indexes, CHECK constraints |
| Idempotency | `client_request_id` unique index + 3-second confirm lock |
| Secrets | Cloudinary key/secret and the OpenRouter key live in server-only modules |
| Uploads | Two-sided size/type validation, Cloudinary limit, `bodySizeLimit` backstop |
| Error disclosure | User-safe messages only; details to Sentry |
| Spreadsheet injection | Leading `=`, `+`, `-`, `@` neutralised in exported CSV cells |

---

## 12. Internationalisation, theming and UX

### Internationalisation (EN / ID)

- **Shell strings** are keyed and rendered through a `<T k="…" />` component backed by the dictionary in
  `lib/i18n.ts` (≈ 84 shell keys).
- **Feature phrases** use the English sentence itself as the key (≈ 382 entries), so a missing translation degrades
  to English rather than exposing a key. Placeholders such as `{name}` and `{seconds}` are interpolated at render
  time.
- **Server messages** travel in English inside the action envelope and are translated on the client by
  `serverText()`, which keeps the two sides decoupled.
- **Voice supports both languages** end to end: recognition locale, spoken numbers, glossary and units.
- The choice is persisted in `localStorage` and applied to `<html lang>`.

### Theming

- Light and dark themes are CSS-variable token sets; the choice persists in `localStorage` under a single preference
  store shared with the language.
- A blocking script in the root layout applies the stored theme before first paint — no flash of the wrong theme.
- Toggles are available from the navbar, the sidebar and the landing page, and changes sync across browser tabs.

### UX behaviours worth noting

| Behaviour | Why |
|---|---|
| URL as state (tab, filters, sort, page) | Refresh, back button and shared links reproduce the exact view |
| Loading states for every fetch | The UI never pretends data arrived |
| Toasts for outcomes, inline errors for fields | A field problem stays next to the field |
| Store status line on store & cashier pages | The operator always knows if the store is selling |
| Reduced-motion support | Animations collapse to short, non-spatial transitions |
| Mobile-first layouts | The cashier is realistically used on a phone |
| Inline confirmation for destructive actions | No native `confirm()`; the button becomes "Delete? Yes / No" |
| Keyboard-friendly primitives | Base UI components provide focus management and ARIA by default |

---

## 13. Codebase conventions

1. **Module-level documentation.** Every non-trivial file opens with a block comment explaining its responsibility,
   its constraints and the *why* behind non-obvious decisions. The repository is meant to be readable without a
   guide.
2. **Pure modules under `lib/quickstore/`.** No `next/*` imports, no database, and no DOM except in the explicitly
   client-only modules (`speech.ts`, `csv.ts`, `receipt-image.ts`).
3. **One response envelope.** Actions answer `ok()` / `fail()`; the UI never has to guess at a shape.
4. **Shared parsers.** Anything understood by both client and server (URL state, upload rules, limits) is written
   once.
5. **`"use server"` only where it belongs.** Action modules carry it; `context.ts` deliberately does not, so other
   actions may import it and a Client Component never can.
6. **No raw SQL in components.** Reads live in `queries.ts`; the sale write lives in `checkout-drizzle.ts`.
7. **Comment style.** Section banners (`// ─── … ───`), JSDoc on exports, and inline notes naming the invariant being
   protected.
8. **Naming.** Actions are verbs (`createStore`, `checkoutSale`), domain helpers are descriptive
   (`prepareCheckoutLines`, `resolveCatalogItem`), and constants carry their unit (`MAX_QTY_PER_LINE`,
   `COUNTDOWN_SECONDS`, `MAX_UPLOAD_BYTES`).

---

## 14. Dependency inventory

### Runtime dependencies (declared in `package.json`)

| Package | Used by |
|---|---|
| `next`, `react`, `react-dom` | Framework and UI runtime |
| `drizzle-orm`, `pg` | Data access |
| `@auth/drizzle-adapter`, `next-auth` | Authentication |
| `@sentry/nextjs` | Monitoring |
| `cloudinary` | Signed media uploads |
| `tailwindcss`, `@tailwindcss/postcss`, `tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge`, `cn` | Styling and class composition |
| `@base-ui/react`, `lucide-react`, `shadcn` | UI primitives and icons |
| `framer-motion`, `recharts`, `sonner` | Motion, charts, toasts |

### Development dependencies

`typescript`, `eslint`, `eslint-config-next`, `jest`, `ts-jest`, `@types/*`, `drizzle-kit`, `dotenv`, `postcss`,
`tailwindcss` (build).

### Declared but not imported (hygiene note)

`better-auth`, `next-cloudinary`, `qrcode`, `jsqr` and `@vercel/analytics` remain in `package.json` from earlier
spikes; the implemented solutions are NextAuth, direct signed Cloudinary uploads, and a dependency-free browser
voice pipeline. They are listed here on purpose — the honest version of a dependency inventory — and are candidates
for removal in a cleanup pass.

---

## 15. Documentation index

| Document | Contents |
|---|---|
| [`../README.md`](../README.md) | Project overview, feature highlights, tech stack, quick start |
| [`Overall.md`](./Overall.md) | This document: full stack, architecture, feature catalogue, data model, RBAC, tests, CI/CD, conventions |
| [`Engineering.md`](./Engineering.md) | Deep dive: flow system, permission matrix, checkout engine, voice pipeline, analytics, demo, trade-offs |

### Diagrams and screenshots

| Image | Subject | Shown in |
|---|---|---|
| `SystemDesign.png` | End-to-end system design | README — System Design |
| `NeonDbArchitecture.png` | Neon Postgres architecture | README — Integrations → Data |
| `NextAuth.png` | Authentication setup | README — Integrations → Identity |
| `Openrouter.png` | OpenRouter model routing | README — Integrations → Intelligence |
| `Cloudinary.png` | Cloudinary asset pipeline | README — Integrations → Assets |
| `Jest.png` | Test suite | README — Integrations → Confidence |
| `Sentry.png` | Sentry monitoring | README — Integrations → Observability |

<p align="center">
  <sub>Back to <a href="../README.md">README</a> · deep dive in <a href="./Engineering.md">Engineering.md</a></sub>
</p>
