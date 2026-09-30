<p align="center">
  <img src="./public/logo.png" width="150" alt="CrossCart" />
</p>

<h1 align="center">CrossCart</h1>

<p align="center">
  <b>The quiet system behind busy businesses.</b><br/>
  A server-first <b>POS &amp; micro-store platform</b> — sell, track stock, run a team and read your own numbers<br/>
  inside one calm workspace built entirely on the Next.js App Router.
</p>

<p align="center">
  <a href="https://nextjs.org"><img alt="Next.js" src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white"/></a>
  <a href="https://react.dev"><img alt="React" src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black"/></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <a href="https://tailwindcss.com"><img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white"/></a>
  <a href="https://ui.shadcn.com"><img alt="shadcn/ui" src="https://img.shields.io/badge/shadcn%2Fui-base--nova-000000?style=for-the-badge&logo=shadcnui&logoColor=white"/></a>
</p>

<p align="center">
  <a href="https://neon.tech"><img alt="Neon Postgres" src="https://img.shields.io/badge/Neon_Postgres-00E29D?style=for-the-badge&logo=postgresql&logoColor=black"/></a>
  <a href="https://orm.drizzle.team"><img alt="Drizzle ORM" src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black"/></a>
  <a href="https://authjs.dev"><img alt="NextAuth" src="https://img.shields.io/badge/NextAuth_v4-6C47FF?style=for-the-badge&logo=auth0&logoColor=white"/></a>
  <a href="https://openrouter.ai"><img alt="OpenRouter" src="https://img.shields.io/badge/OpenRouter_AI-FF6B6B?style=for-the-badge&logo=openai&logoColor=white"/></a>
  <a href="https://cloudinary.com"><img alt="Cloudinary" src="https://img.shields.io/badge/Cloudinary-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white"/></a>
  <a href="https://sentry.io"><img alt="Sentry" src="https://img.shields.io/badge/Sentry-362D59?style=for-the-badge&logo=sentry&logoColor=white"/></a>
</p>

<p align="center">
  <a href="https://jestjs.io"><img alt="Jest" src="https://img.shields.io/badge/Jest-170_cases-C21325?style=for-the-badge&logo=jest&logoColor=white"/></a>
  <a href="https://github.com/zannunakiz/CrossCart/actions"><img alt="CI" src="https://img.shields.io/badge/CI-lint_%7C_build_%7C_unit_%7C_RBAC-2088FF?style=for-the-badge&logo=githubactions&logoColor=white"/></a>
  <img alt="License" src="https://img.shields.io/badge/License-MIT-3DA639?style=for-the-badge"/>
</p>

<p align="center">
  <i>Want to see it before reading a single line? — <code>/demo</code> runs the full cashier with <b>no login and no database</b>.</i>
</p>

---

## 🏗️ System Design

<p align="center">
  <img src="./documentation/SystemDesign.png" alt="CrossCart — system design" width="920" />
</p>

<p align="center">
  <sub>
    <b>One request, end to end:</b> the browser → a Server Action (session → role → permission) → the pure domain layer
    → Neon Postgres through Drizzle → a typed envelope back to the UI.<br/>
    External providers stay outside the trust boundary: Google OAuth, OpenRouter, Cloudinary and Sentry.
  </sub>
</p>

---

## 📚 Table of Contents

| | Section |
|---|---|
| 🏗️ | [System Design](#-system-design) |
| 🧭 | [About](#-about) |
| 🚀 | [Get Started](#-get-started) |
| 🔌 | [Integrations](#-integrations) |
| ✨ | [Features](#-features) |
| 🧱 | [Tech Stack](#-tech-stack) |
| 🛠️ | [Engineering Highlights](#-engineering-highlights) |
| 🗂️ | [Project Structure](#-project-structure) |
| 📜 | [Scripts](#-scripts) |
| 🧪 | [Tests &amp; CI](#-tests--ci) |
| 🤝 | [Contributing](#-contributing) |
| 📄 | [License](#-license) |
| 🌐 | [Live](#-live) |

---

## 🧭 About

**CrossCart** is a free, multi-tenant **POS & micro-store console** — the operating system for a small business
that has no patience for POS software.

A store is created in seconds, becomes `open` or `closed` with one switch, and immediately has a **catalog**,
a **cashier**, a **revenue dashboard**, a **team with real roles** and a **payment QR** the customer scans.
Every business action — items, sales, members, settings — is one **Server Action** away, guarded by the same
permission matrix, on the same page the user is already looking at.

Three surfaces ship today:

| Surface | Route | What it is |
|---|---|---|
| **Landing & auth** | `/` | Product story, Google sign-in, theme + language switches, live "today at a glance" pulse |
| **QuickStore** | `/quickstore` → `/quickstore/[storeId]` | The product — stores, catalog, cashier, analytics, membership |
| **Demo Cashier** | `/demo` | The real cashier UI against a mocked catalog: no account, no DB, full flow |
| **Modern POS** | `/pos` | Parked roadmap surface (restaurant-grade register + KDS) — a deliberate placeholder |

---

## 🚀 Get Started

**Requirements:** Node.js **22+** (the version CI pins), npm, a Postgres database (**Neon** recommended),
and accounts for **Google OAuth**, **Cloudinary** and **OpenRouter** — plus **Sentry** if you want error
reporting locally. Nothing else is required: there is no exotic runtime, no Docker and no code generation step.

### 1 — Clone the repository

```bash
git clone https://github.com/zannunakiz/CrossCart.git
cd CrossCart
```

### 2 — Install dependencies

```bash
npm install            # installs everything, including drizzle-kit and Jest
```

### 3 — Configure the environment

Everything the app reads lives in `.env.local` (used by `next dev`, `drizzle-kit` and `scripts/db-clear.mjs`):

```bash
cp .env.example .env.local     # macOS / Linux
copy .env.example .env.local   # Windows (cmd / PowerShell)
```

Every key is documented inline in the example file. The ones you cannot start without:

| Variable | Why it is needed |
|---|---|
| `DATABASE_URI` | Neon connection string — Drizzle, `db:migrate` and the runtime `pg.Pool` all read it |
| `NEXTAUTH_SECRET` · `NEXTAUTH_URL` | NextAuth session signing and the callback base URL (`http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | Google sign-in from the landing page |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET` | Store payment-QR uploads (signed, server-side only) |
| `OPEN_ROUTER_KEY` | Voice ordering — `OPEN_ROUTER_MODEL` is optional and defaults to `openrouter/free` |
| `SENTRY_AUTH_TOKEN` | Source maps + release upload (optional; only used at build time) |

> Want to see the product without any of it? `/demo` runs the full cashier with a mocked catalog,
> **no login and no database** — no environment needed.

### 4 — Apply the schema

```bash
npm run db:migrate     # applies the 14 migrations in drizzle/ to DATABASE_URI
```

Changed `lib/db/schema.ts`? Generate the next migration first, then apply it:

```bash
npm run db:generate    # drizzle-kit generate → a new SQL file in drizzle/
npm run db:migrate     # apply pending migrations
```

Starting over locally? `npm run db:clear` truncates every table in `public`, then re-run `npm run db:migrate`.

### 5 — Run it locally

```bash
npm run dev            # → http://localhost:3000
```

Then walk the three surfaces:

- `/` — the landing page: sign in with Google, switch theme and language.
- `/quickstore` — create a store, add items, invite a teammate, ring up a sale.
- `/demo` — the whole cashier experience for guests, with a mocked catalog and zero backend traffic.
- `/pos` — the parked roadmap surface (a deliberate placeholder).

### 6 — Developer command palette

```bash
# ── Production ──────────────────────────────────────────────────────────────
npm run build            # Next.js production build
npm run start            # serve the build (run after `npm run build`)

# ── Quality gates — the same four jobs CI runs ──────────────────────────────
npm run lint             # ESLint 9 (flat config, eslint-config-next)
npm run test:unit        # Jest → tests/unit  (money, cart, stock, checkout, voice, list)
npm run test:rbac        # Jest → tests/rbac  (permission matrix + guarded Server Actions)

# ── Database — Drizzle Kit, reads .env.local ────────────────────────────────
npm run db:generate      # generate a migration from schema changes
npm run db:migrate       # apply pending migrations
npm run db:clear         # truncate local QuickStore data (scripts/db-clear.mjs)
```

Run exactly what CI runs, before you push — four parallel jobs, so a red check names what broke:

```bash
npm run lint && npm run test:unit && npm run test:rbac && npm run build
```

> The full one-line-per-script reference lives in [📜 Scripts](#-scripts).

---

## 🔌 Integrations

> The services CrossCart actually talks to — and what each one is doing under the hood.
> Full architecture, data model and invariants: [`documentation/Overall.md`](./documentation/Overall.md) ·
> [`documentation/Engineering.md`](./documentation/Engineering.md).

### 🗄️ Data — Neon Postgres, modelled in code

<p align="center">
  <img src="./documentation/NeonDbArchitecture.png" alt="Neon Postgres architecture" width="760" />
</p>

**Neon** is the only stateful dependency, and it is reached through **Drizzle ORM over `pg`** — never through a
schema-less client. `lib/db/schema.ts` is the single source of truth for the entire app: the store, item,
membership and receipt tables; the `store_role`, `currency_type` and `qs_sale_status` enums; foreign keys; CHECK
constraints (`stocks` 0–999 or NULL, `discount_percent` 0–100, `quantity > 0`); a **case-insensitive unique index**
on `(store_id, lower(name))`; and every index shaped to a real access path (`stores_user_idx`,
`qs_history_store_paid_at_idx … DESC`). Types are *inferred* from that schema — `Store`, `StoreItem`, `QsHistory`,
`StoreRole` and friends — so renaming a column breaks the build instead of production. Fourteen migrations in
`drizzle/` record how the schema got here, and `drizzle-kit migrate` applies them.

The connection is deliberately boring: **one `pg.Pool` (`max: 10`) cached on `globalThis`** outside production, so
HMR reloads and serverless invocations reuse a warm pool instead of leaking a new one per module evaluation. Money
is `numeric(18,2)` at rest and **integer cents in JavaScript**; primary keys are database-generated UUID v4s; and
concurrent checkouts are serialised with `SELECT … FOR UPDATE` inside a single transaction.

### 🔐 Identity — NextAuth, Drizzle-adapter, and an id you can trust

<p align="center">
  <img src="./documentation/NextAuth.png" alt="NextAuth" width="760" />
</p>

Google OAuth is the only provider, and the `@auth/drizzle-adapter` writes into the same Postgres database as the
rest of the app — `users`, `accounts`, `sessions` and `verification_tokens` are ordinary Drizzle tables, so
business rows can reference a user with a real foreign key (`stores.user_id`, `store_members.user_id`,
`qs_history.cashier_id`) instead of a loose string.

Sessions are **JWTs**, with two small callbacks that make the rest of the codebase simpler: `jwt` persists the
database user id into the token, and `session` exposes it as `session.user.id`. Two consequences:

- **`getServerSession` is the only source of identity.** It gates the `(main)` layout server-side, and every
  Server Action re-derives it through `currentSession()` — no id ever arrives from the client.
- **`useSession` is presentation-only.** It decorates the navbar avatar and highlights "you" in the member list; it
  never authorizes anything.

Because identity is a database id rather than a provider profile, the rest of the authorization stack (role →
permission) can be expressed as plain SQL joins.

### 🎙️ Intelligence — OpenRouter behind a strict contract

<p align="center">
  <img src="./documentation/Openrouter.png" alt="OpenRouter" width="760" />
</p>

Voice ordering is the one feature where untrusted output is unavoidable, so the provider is wrapped in a contract
the model cannot break. `lib/openrouter.ts` is ~40 lines of **native `fetch`** — no SDK, nothing to keep in sync —
and reads the key **at call time**, so a missing `OPEN_ROUTER_KEY` fails loudly instead of producing a silently
broken client. Requests go to `/chat/completions` with the bearer key plus `HTTP-Referer` / `X-Title` attribution,
against `OPEN_ROUTER_MODEL` or the zero-cost default `openrouter/free`.

Everything probabilistic is contained in the prompt; everything downstream is deterministic:

| Stage | Guarantee |
|---|---|
| Prompt | JSON-only, "never invent products", read the whole sentence, allow slang/one-word names |
| Transport | Timeout + token caps per call; provider errors become typed failures, never raw text to the user |
| Parsing | `extractJsonObject` recovers the JSON object even from fenced or prose-wrapped answers |
| Mapping | Every line is re-resolved against **catalog rows the server loaded**, so a hallucinated id is dropped |
| Delivery | Lines land in a review panel — a human confirms before anything reaches the cart |

That is the whole point of the design: the model may be swapped (free router → paid model) without touching a
single line of the mapping pipeline, and a bad answer costs one tap instead of one wrong receipt.

### 🖼️ Assets — signed Cloudinary uploads only

<p align="center">
  <img src="./documentation/Cloudinary.png" alt="Cloudinary" width="760" />
</p>

The only user-supplied binary in CrossCart is a store's **payment QR**, and it is uploaded through a chain in which
every link can say no:

1. **The browser refuses first** — `lib/quickstore/upload.ts` rejects a file that is not an image or exceeds 2 MB
   *before a request exists*, so the user sees our wording instead of a framework error.
2. **The Server Action re-checks** — `uploadStoreQr` never trusts that the UI ran (`type`, `size`, then a signed
   `cloudinary.uploader.upload` of the buffer, folder `crosscart/quickstore/qr`).
3. **Cloudinary enforces it again** at the API level (`max_file_size`), and the returned `secure_url` is what gets
   stored on `stores.payment_qr`.
4. **Next.js caps the body** (`serverActions.bodySizeLimit: '3mb'`) as a backstop against a POST that never went
   through the browser.

The API **key and secret stay server-side** — they live in a module only the action imports. The browser only ever
receives the public cloud name, and a failed upload mutates nothing in the database, so the store keeps its previous
QR rather than losing it.

### 🧪 Confidence — Jest, 170 tests with no database in sight

<p align="center">
  <img src="./documentation/Jest.png" alt="Jest" width="760" />
</p>

**9 suites, 170 cases, zero mocks of the code under test.** That is only possible because the domain lives in
`lib/quickstore/*`, which imports neither `next/*` nor the database — so the suites can execute the real functions
directly, with mocks only at the boundary (the checkout port, the session).

| Suite group | What it exercises |
|---|---|
| `tests/unit/*` | Integer-cent money, price/quantity parsing, stock availability, search ranking, cart operations, the confirm state machine, `performCheckout` against an in-memory port (replay, rollback, races), spoken-number/glossary/plural voice parsing, transcript de-duplication, list-query round-trips |
| `tests/rbac/*` | The permission matrix itself, tab gating, and every guarded Server Action driven through **7 personas** — anonymous, guest, owner, admin, master, cross-store caller, dead/malformed store |

The runner is ts-jest with a CommonJS transform and a `moduleNameMapper` that mirrors the `@/*` alias, so the app's
ESM-style TypeScript loads in Jest with no duplicated type shims and no pre-test build. Nothing touches a network or
a secret: `npm run test:unit` and `npm run test:rbac` are separate CI jobs, so a red check names exactly what broke.

### 📡 Observability — Sentry, wired through a first-party tunnel

<p align="center">
  <img src="./documentation/Sentry.png" alt="Sentry" width="760" />
</p>

Errors are captured on **all three runtimes**. `instrumentation.ts` loads `sentry.server.config.ts` or
`sentry.edge.config.ts` depending on `NEXT_RUNTIME`, and — the part that matters for a Server-Action-first app — it
exports `onRequestError = Sentry.captureRequestError`, so a thrown error inside any action or route handler reports
itself without a `try/catch` in every file. The browser is instrumented by `instrumentation-client.ts`, and
`app/global-error.tsx` catches the last-resort render failure.

Two production-grade details:

- **Nothing gets silenced.** `withSentryConfig` routes browser events through a same-origin **tunnel**
  (`/monitoring`), so privacy extensions and ad-blockers cannot starve the error feed.
- **Stack traces stay readable.** Source maps are uploaded at build time (`SENTRY_AUTH_TOKEN`, `org`/`project`
  configured in `next.config.mjs`), `widenClientFileUpload` widens the upload set, and Sentry's debug logging is
  tree-shaken out of production bundles.

What arrives in Sentry is the *technical* failure; what the user sees is always a translated, user-safe sentence
from the action envelope. Two audiences, two different truths — never mixed.

---

## ✨ Features

<table>
<tr><td width="50%" valign="top">

**🏪 Stores &amp; catalog**
- Create a store in one dialog (`name ≤ 20`, `description ≤ 50`, enforced in UI **and** DB)
- Soft delete — history survives for audit and dispute handling
- Items with price, discount (0–100%), tracked stock (0–999) or unlimited, availability toggle
- Case-insensitive unique names per store — a **database** index, not a hope
- Search, filter, sort (name / price / stock / sold / newest) and paging, all in SQL

**🧾 A cashier that cannot double-sell**
- Client idempotency key → a retried click returns the *original* receipt
- Prices recomputed server-side, money in integer cents
- `FOR UPDATE` row locks in deterministic order → no deadlock, no negative stock
- History + stock in one transaction; any failure rolls both back
- Stale-stock `409` answers with per-line issues and a one-click "refresh & clamp"

</td><td width="50%" valign="top">

**🎙️ Voice ordering (EN / ID)**
- Browser-native speech recognition — no key, no vendor, no audio upload
- LLM reads the whole sentence; every line is resolved back onto **real catalog rows**
- Speaks "dua sate dan satu soto", "fred rise two", "piscok" — glossary + homophones + plural recovery
- Deterministic rescue pass turns one dead sentence into its products
- Nothing enters the cart until a human confirms the review panel

**📊 Numbers that belong to the operator**
- Revenue / sales / items / discounts, top items, per-cashier performance, hour-of-day curve
- Buckets follow **their** timezone and day boundaries, computed in SQL
- Export the whole filtered range as CSV, or one receipt as CSV **and** a shareable PNG

**🔐 Real RBAC · 👥 Teams · 🌗 EN/ID · 📱 Mobile-first UX**
- Permission matrix instead of `if (role === "admin")` sprinkled everywhere
- Invite by email, promote, demote, remove — with owner protection
- Dark/light with no flash-of-wrong-theme, full Indonesian translation
- Mobile-first layouts, reduced-motion aware animation, toasts, URL-addressable views

</td></tr>
</table>

---

## 🧱 Tech Stack

**Application**

| Layer | Choice | Why it is here |
|---|---|---|
| Framework | **Next.js 16** (App Router, RSC) | One runtime for UI *and* backend: Server Components render data, Server Actions mutate it — no REST layer to keep in sync |
| UI runtime | **React 19** | `useSyncExternalStore` for the preference store, modern transitions and Suspense boundaries |
| Language | **TypeScript 5** (strict, `@/*` alias) | Domain types are inferred from the Drizzle schema — one source of truth from SQL to JSX |
| Styling | **Tailwind CSS v4** + `tw-animate-css` | Token-driven theme (light/dark) with zero runtime CSS |
| Components | **shadcn/ui** (`base-nova`) over **Base UI** primitives | Accessible, copy-owned components — keyboard behaviour included, no opaque dependency |
| Motion | **Framer Motion** | Entrance choreography that respects `prefers-reduced-motion` on every animated surface |
| Charts | **Recharts** via the shadcn chart layer | Responsive revenue/volume charts with themed tooltips |
| Icons / toasts | **lucide-react**, **sonner** | Icon set + toast queue |

**Data & identity**

| Layer | Choice | Why it is here |
|---|---|---|
| Database | **Neon Postgres** | Serverless Postgres with branching; the schema uses real relational guarantees (FKs, CHECKs, functional unique indexes) |
| ORM | **Drizzle ORM + drizzle-kit** | SQL-first types, `db.query` relations, and 14 incremental migrations under version control |
| Driver | **`pg` Pool** (`max: 10`, global-cached across HMR) | One connection pool per process instead of one per request |
| Auth | **NextAuth v4** + `@auth/drizzle-adapter`, Google OAuth, JWT sessions | Session identity resolved server-side, then passed through the RBAC layer |

**Platform & quality**

| Layer | Choice | Why it is here |
|---|---|---|
| AI | **OpenRouter** (`openrouter/free`), raw `fetch` | Pluggable model + zero SDK surface; the provider may change, our contract does not |
| Media | **Cloudinary** (signed, server-side uploads) | The API secret never reaches the browser; a 2 MB / image-only rule is enforced on both sides |
| Monitoring | **Sentry** (`@sentry/nextjs`, client + server + edge, `/monitoring` tunnel) | Errors land even behind ad-blockers; `onRequestError` captures App Router failures |
| Tests | **Jest 30 + ts-jest** | 9 suites / **170 cases** of pure domain and RBAC tests — no database, no network |
| CI | **GitHub Actions** — `lint`, `build`, `unit test`, `RBAC test` | Four independent, individually-required status checks |
| Fonts | **`next/font`** (Inter, JetBrains Mono, Source Serif 4) | Self-hosted, zero layout shift, mapped to CSS variables |

---

## 🛠️ Engineering Highlights

This is the part worth reading. Everything below is enforced by code, not by convention.

### 1. Server-first data flow — the API *is* the component tree

There is no public API to secure: the only route handler left is the auth one. Every read and write is a
**Server Action** under `lib/actions/**`, and each one independently re-establishes identity:

```
currentSession()  →  getUserRole(userId, storeId)  →  hasPermission(role, "…:…")  →  domain logic  →  Drizzle
    401 Unauthorized         guest → no role              403 Forbidden              pure rules        SQL
```

A Server Action still answers a plain POST, so **nothing about the caller is ever taken from the arguments** —
identity comes from the session cookie and the role is re-derived from the database on every call.
Failures return a typed envelope (`{ ok: false, error, status, code, issues }`) that preserves the HTTP
semantics the UI branches on.

### 2. Scalable RBAC — a permission matrix, not role checks

16 `resource:action` permissions (`store:*`, `member:*`, `item:*`, `sale:*`) live in one auditable file:

| Permission | Master | Admin | Guest |
|---|:--:|:--:|:--:|
| `store:view` · `store:update-status` | ✅ | ✅ | ❌ |
| `store:update-details` · `store:update-credential` · `store:delete` | ✅ | ❌ | ❌ |
| `member:view` · `item:*` · `sale:view` · `sale:create` | ✅ | ✅ | ❌ |
| `member:invite` · `member:update-role` · `member:remove` · `sale:void` | ✅ | ❌ | ❌ |

- Call sites never branch on a **role name** — a role gaining or losing a capability is a one-line matrix edit.
- The **same** matrix gates the UI (`hasPermission` → which tabs render), the **URL** (`?tab=` is rewritten when
  the role may not open it) and the **server** (each action re-checks): three views, one truth.
- The store owner is implicitly `master`; nobody may change their own membership; the owner row can never be
  re-roled or removed; a soft-deleted store answers "not found" on every path.
- Adding `staff` or `viewer`, or per-member permission overrides, is additive — no schema change, no rewrite.

### 3. The checkout engine — a sale that is impossible to get wrong

```
idempotent replay  →  FOR UPDATE (sorted ids)  →  validate + reprice  →  header + snapshot lines  →  conditional decrement
  same key = same receipt       no deadlocks          integer cents         one transaction            stock ≥ 0 always
```

- Money is never a float: UI → integer cents → `numeric(18,2)` → back to cents for display.
- A unique index on `client_request_id` means a double click, a retry, or a lost response **replays the original
  receipt** instead of selling twice.
- Receipt lines **snapshot** name, price and discount, and the cashier's display name is stored on the sale —
  editing or deleting an item or a user can never rewrite history.
- Receipt numbers are unique per store and retried on collision; stock decrement is guarded by SQL
  (`stocks is null or stocks >= qty`) even beyond the row lock; any failure rolls the whole transaction back.

### 4. Voice ordering — probabilistic input, deterministic output

```
Web Speech API ──▶ transcript ──▶ Server Action (session + sale:create + catalog) ──▶ OpenRouter
      │                                                                                  │
      └── collapseRepeats (Android duplicates)            strict JSON ◀───────────────────┘
                                                                 │
      real catalog rows ◀── glossary · homophones · spoken numbers · plural recovery · rescue scan
```

- The model is told, in the system prompt, that it **must not invent products** — and it is never trusted: an id
  that is not in the store catalog is dropped, a name is re-resolved by exact → containment → nearest
  assumption, and a sentence the model gave up on is split by a bounded sliding-window scan so
  *"one potato to three pens and book"* still becomes three real lines.
- Speech engines on Android re-deliver results; the transcript is rebuilt from the snapshot and de-duplicated, so
  one spoken phrase never becomes *"satu tahu satu tahu"*.
- Lines land in a **review panel** — the cashier confirms before anything touches the cart.

### 5. Analytics in the operator's timezone, computed in SQL

- Six parallel aggregations (per-currency totals, revenue series, hour-of-day, top items, per-cashier) — a busy
  store never ships thousands of receipts to draw one chart.
- Bucket granularity adapts to the window (day ≤ 31d, week ≤ 180d, month beyond), and every bucket is shifted by
  the client's UTC offset so *their* day and hour boundaries win, not the database's.
- Voided sales stay visible in the list but never inflate revenue.
- Exports: range CSV (UTF-8 BOM + CRLF, formula-injection disarmed) and a per-receipt **PNG** drawn on a 2×
  canvas — measure once, paint once, always light "paper" even in dark mode.

### 6. Quality gates

| Gate | What it proves |
|---|---|
| `npm run test:unit` | Money math, cart, search ranking, stock rules, the confirm state machine, checkout flow against an in-memory fake, voice parsing, URL query round-trips |
| `npm run test:rbac` | The matrix itself **and** the guarded actions across 7 personas: anonymous, guest, owner, admin member, master member, cross-store, unknown / soft-deleted / malformed store |
| `npm run lint` · `npm run build` | ESLint 9 + a production build — four parallel CI jobs, each individually required |
| Sentry | Client, server and edge instrumentation, tunnelled through `/monitoring` so ad-blockers cannot silence it |

---

## 🗂️ Project Structure

```
CrossCart/
├── app/                            # App Router — routes, layouts, boundaries
│   ├── (main)/                     # Authenticated shell (navbar + sidebar + providers)
│   │   ├── dashboard/              # Workspace picker
│   │   └── quickstore/             # Store list → store detail (?tab=) → cashier
│   ├── api/auth/[...nextauth]/     # The ONLY route handler (NextAuth)
│   ├── demo/                       # Guest-playable cashier — no session, no database
│   ├── pos/                        # Parked “Modern POS” surface
│   ├── layout.tsx                  # Fonts + no-flash theme script + providers
│   └── global-error.tsx            # Sentry-aware global error boundary
├── lib/
│   ├── actions/                    # Server Actions — context → result → serialize
│   │   └── store · item · member · sale · voice · history · upload
│   ├── quickstore/                 # Pure domain (no framework, no DB):
│   │                               # cashier · checkout (+ Drizzle port) · voice-order · speech
│   │                               # history · item-list · csv · receipt-image · permissions · tabs
│   ├── db/                         # Drizzle schema + pooled Neon client
│   ├── demo/                       # Offline doubles behind the /demo page
│   └── auth · openrouter · cloudinary · i18n · preferences · ids · utils
├── components/                     # Shell (navbar/sidebar), QuickStore tabs & cashier, ui/ (shadcn)
├── drizzle/                        # 14 generated SQL migrations + snapshots
├── tests/                          # unit/ (domain logic) + rbac/ (matrix & guarded actions)
└── documentation/                  # Overall.md · Engineering.md · architecture images
```

> The split is deliberate: **`lib/quickstore/*` never imports Next.js or the database**, so the rules of the
> business (money, stock, permissions, parsing) are unit-testable in isolation, while `lib/actions/*` owns the
> framework boundary and `lib/db/*` owns SQL.

---

## 📜 Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server with HMR |
| `npm run build` / `npm run start` | Production build and serve |
| `npm run lint` | ESLint 9 (flat config, `eslint-config-next`) |
| `npm run test:unit` | Domain suite — money, cart, stock, checkout, voice, list state |
| `npm run test:rbac` | Permission matrix + guarded Server Actions across every persona |
| `npm run db:generate` | Generate a migration from schema changes (`drizzle-kit`) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:clear` | Wipe local QuickStore data (`scripts/db-clear.mjs`) |

---

## 🧪 Tests & CI

| Suite | Cases | Focus |
|---|:--:|---|
| `tests/unit/cashier.test.ts` | 46 | Integer-cents money, price/quantity parsing, stock rules, search ranking, cart ops, confirm state machine |
| `tests/unit/checkout.test.ts` | 26 | `performCheckout` end-to-end against an in-memory port: idempotent replay, rollback, stock races, totals |
| `tests/unit/voice-order.test.ts` | 25 | Spoken numbers, homophones, plurals, glossary, rescue scan, hallucinated-id rejection, de-duplication |
| `tests/rbac/actions-rbac.test.ts` | 28 | Every guarded action × 7 personas (anonymous, guest, owner, admin, master, cross-store, dead store) |
| `tests/rbac/permissions.test.ts` | 12 | The matrix itself and its named helpers |
| `tests/unit/item-list.test.ts` · `speech.test.ts` · `ids-utils.test.ts` · `store-tabs.test.ts` | 33 | Query round-trips, transcript de-duplication, UUID guards, tab gating |

**170 cases, 9 suites, zero mocks of the thing under test** — the domain is pure enough to exercise directly.
GitHub Actions runs `lint`, `build`, `unit test` and `RBAC test` as **four parallel jobs**, so a red check names
exactly what broke.

---

## 🤝 Contributing

Issues and pull requests are welcome. The house rules are simple and visible in the code itself:

1. **Domain logic stays pure** — if it needs a database or a browser, it does not belong in `lib/quickstore/`.
2. **Permissions go through the matrix** — never add an action that skips `currentSession()` → `getUserRole()` → `hasPermission()`.
3. **Explain the *why* in a comment** — every non-obvious decision in this repository is documented next to the code.
4. **Ship with a test** — if the change touches money, stock, or access, prove it.

---

## 📄 License

Released under the **MIT License** — see [`LICENSE`](./LICENSE).

---

## 🌐 Live

<p align="center">
  <a href="https://cross-cart-roan.vercel.app" target="_blank" rel="noopener noreferrer">
    <img src="./documentation/LiveOverview.png" alt="CrossCart — live overview" width="900" />
  </a>
</p>

CrossCart is **deployed and running**:

| Entry point | Link | What it opens |
|---|---|---|
| 🌐 **App** | <a href="https://cross-cart-roan.vercel.app" target="_blank" rel="noopener noreferrer">cross-cart-roan.vercel.app</a> | Landing page → Google sign-in → stores, catalog, cashier and analytics |
| 🎬 **Demo - No Account** | <a href="https://cross-cart-roan.vercel.app/demo" target="_blank" rel="noopener noreferrer">cross-cart-roan.vercel.app/demo</a> | The full cashier — **no login, no database** — mocked catalog, product search, voice ordering, receipt and CSV/PNG export |

> The demo runs the **real** cashier components (`ProductSearch`, `VoiceOrder`, `SaleCart`, `ReceiptPanel`) against an
> in-memory catalog, so the flows, the voice pipeline and the receipt you see are the production ones.

<p align="center">
  <br/>
  Built with 🧡 by <b>Richky Abednego</b><br/>
  <sub>Deep dives: <a href="./documentation/Overall.md">Overall</a> · <a href="./documentation/Engineering.md">Engineering</a></sub>
</p>