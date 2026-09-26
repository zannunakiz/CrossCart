import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const healthChecks = pgTable("health_checks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  status: text("status").notNull().default("ok"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

/* -------------------------------------------------------------------------- */
/* Auth.js (NextAuth) tables — mirrors ExampleOauth's Account/Session schema,  */
/* but on Neon Postgres via Drizzle. Column property names must stay camelCase */
/* because @auth/drizzle-adapter reads them by name.                           */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
})

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    uniqueIndex("accounts_provider_provider_account_id_key").on(
      account.provider,
      account.providerAccountId
    ),
  ]
)

export const sessions = pgTable("sessions", {
  // Auth.js expects sessionToken to be the primary key of its sessions table.
  id: text("id").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    uniqueIndex("verification_tokens_identifier_token_key").on(
      verificationToken.identifier,
      verificationToken.token
    ),
  ]
)
