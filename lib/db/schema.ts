import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────
export const healthChecks = pgTable("health_checks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  status: text("status").notNull().default("ok"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Auth.js (NextAuth) tables — mirrors ExampleOauth's Account/Session schema
// but on Neon Postgres via Drizzle. Column property names must stay camelCase
// because @auth/drizzle-adapter reads them by name.
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// QuickStore — enums
// ─────────────────────────────────────────────────────────────────────────────

/** Role enum — extensible; add 'viewer' etc. in future without schema break. */
export const storeRoleEnum = pgEnum("store_role", ["master", "admin"])

/** Supported pricing currencies. */
export const currencyEnum = pgEnum("currency_type", ["USD", "IDR"])

/**
 * Lifecycle of a recorded sale.
 * `voided` is reserved for future refunds/cancellations without a schema break.
 */
export const qsSaleStatusEnum = pgEnum("qs_sale_status", ["completed", "voided"])

/** How the customer paid. */
export const qsPaymentMethodEnum = pgEnum("qs_payment_method", ["qr", "cash"])

// ─────────────────────────────────────────────────────────────────────────────
// QuickStore — stores
// ─────────────────────────────────────────────────────────────────────────────
export const stores = pgTable("stores", {
  /** Surrogate UUID PK — stable, shareable, URL-safe. */
  id: uuid("id").primaryKey().defaultRandom(),

  /** Owner / creator of the store. */
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  /** Display name — max 20 chars enforced at DB level too. */
  name: varchar("name", { length: 20 }).notNull(),

  /** Short description shown on the store card. */
  description: varchar("description", { length: 100 }),

  /** Whether the store is currently accepting orders. */
  open: boolean("open").notNull().default(true),

  /**
   * Cloudinary secure URL for a payment QR code image.
   * Stored as full URL so it works without re-deriving from public_id.
   */
  paymentQr: text("payment_qr"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// QuickStore — store members (RBAC)
// ─────────────────────────────────────────────────────────────────────────────
export const storeMembers = pgTable(
  "store_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),

    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    role: storeRoleEnum("role").notNull().default("admin"),

    /** Who sent the invite — auditing purposes. */
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** A user can only have one role per store. */
    uniqueIndex("store_members_store_user_unique").on(t.storeId, t.userId),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// QuickStore — items
// ─────────────────────────────────────────────────────────────────────────────
export const storeItems = pgTable("store_items", {
  id: uuid("id").primaryKey().defaultRandom(),

  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),

  /** Who created this item. */
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "set null" }),

  name: varchar("name", { length: 20 }).notNull(),
  description: varchar("description", { length: 100 }),

  /**
   * Numeric with high precision — covers both USD cents and IDR amounts
   * without floating-point rounding errors.
   */
  price: numeric("price", { precision: 18, scale: 2 }).notNull().default("0"),

  currency: currencyEnum("currency").notNull().default("IDR"),

  /** Is this item currently available for purchase? */
  available: boolean("available").notNull().default(true),

  /** Inventory stock count. NULL means unlimited / not tracked. */
  stocks: integer("stocks"),

  /** 0-100 percentage discount applied at checkout. */
  discountPercent: integer("discount_percent").notNull().default(0),

  /** Pin the item to the top of the item list. */
  highlight: boolean("highlight").notNull().default(false),

  /** Running total of how many times this item has been purchased. */
  purchasedAmount: integer("purchased_amount").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────────────────────
// QuickStore — transaction history
//
// Two-table design (header + lines) so historical receipts stay queryable for
// reporting: sales total per day, best sellers, cashier performance, etc.
// Line rows SNAPSHOT name/price/discount at checkout time, which means editing
// or deleting an item later never rewrites history.
// ─────────────────────────────────────────────────────────────────────────────
export const qsHistory = pgTable(
  "qs_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),

    /** Who rang up the sale. Kept even if the operator later loses access. */
    cashierId: text("cashier_id").references(() => users.id, { onDelete: "set null" }),

    /** Human readable identifier printed on the receipt, e.g. QS-20260926-7F3K. */
    receiptNumber: varchar("receipt_number", { length: 24 }).notNull(),

    status: qsSaleStatusEnum("status").notNull().default("completed"),

    /** Sale currency — a single sale never mixes currencies. */
    currency: currencyEnum("currency").notNull().default("IDR"),

    /** Sum of unit price × quantity before discounts. */
    subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull(),

    /** Total value of all line discounts (in sale currency). */
    discountTotal: numeric("discount_total", { precision: 18, scale: 2 }).notNull().default("0"),

    /** Amount the customer actually pays. */
    total: numeric("total", { precision: 18, scale: 2 }).notNull(),

    /** Distinct product lines on the receipt. */
    lineCount: integer("line_count").notNull(),

    /** Total units sold (denormalised for fast reporting). */
    itemCount: integer("item_count").notNull(),

    paymentMethod: qsPaymentMethodEnum("payment_method").notNull().default("qr"),

    /** Optional cashier note (max 140 chars). */
    note: varchar("note", { length: 140 }),

    /**
     * Idempotency key generated by the cashier client. The unique index makes
     * double submissions (double click, retried request, retry after a lost
     * response) return the original receipt instead of selling twice.
     */
    clientRequestId: varchar("client_request_id", { length: 64 }),

    /** When the customer actually paid. */
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Receipt numbers are unique per store (scales to many stores safely). */
    uniqueIndex("qs_history_store_receipt_unique").on(t.storeId, t.receiptNumber),
    uniqueIndex("qs_history_client_request_unique").on(t.clientRequestId),
    /** Primary access path: "latest sales of this store". */
    index("qs_history_store_paid_at_idx").on(t.storeId, t.paidAt.desc()),
    /** "Sales rung up by this cashier". */
    index("qs_history_cashier_idx").on(t.cashierId),
  ]
)

export const qsHistoryItems = pgTable(
  "qs_history_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    historyId: uuid("history_id")
      .notNull()
      .references(() => qsHistory.id, { onDelete: "cascade" }),

    /**
     * Live item reference — nullable so deleting an item never destroys the
     * receipt. Reporting should prefer the snapshot columns below.
     */
    itemId: uuid("item_id").references(() => storeItems.id, { onDelete: "set null" }),

    /** Snapshot of the product name at checkout time. */
    name: varchar("name", { length: 20 }).notNull(),

    /** Snapshot of the list price at checkout time. */
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),

    /** Snapshot of the line discount at checkout time (0-100). */
    discountPercent: integer("discount_percent").notNull().default(0),

    /** Price actually charged per unit after the discount. */
    unitPricePaid: numeric("unit_price_paid", { precision: 18, scale: 2 }).notNull(),

    quantity: integer("quantity").notNull(),

    /** unitPricePaid × quantity. */
    lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull(),

    /** Position on the receipt, so it always prints in the cashier's order. */
    position: integer("position").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("qs_history_items_history_idx").on(t.historyId),
    index("qs_history_items_item_idx").on(t.itemId),
    /** Defensive guard: a line can never record a non-positive quantity. */
    check("qs_history_items_quantity_check", sql`${t.quantity} > 0`),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// Re-export type helpers (inferred from schema for type-safe queries)
// ─────────────────────────────────────────────────────────────────────────────
export type Store = typeof stores.$inferSelect
export type NewStore = typeof stores.$inferInsert

export type StoreMember = typeof storeMembers.$inferSelect
export type NewStoreMember = typeof storeMembers.$inferInsert

export type StoreItem = typeof storeItems.$inferSelect
export type NewStoreItem = typeof storeItems.$inferInsert

export type QsHistory = typeof qsHistory.$inferSelect
export type NewQsHistory = typeof qsHistory.$inferInsert

export type QsHistoryItem = typeof qsHistoryItems.$inferSelect
export type NewQsHistoryItem = typeof qsHistoryItems.$inferInsert

export type StoreRole = (typeof storeRoleEnum.enumValues)[number]
export type CurrencyType = (typeof currencyEnum.enumValues)[number]
export type QsSaleStatus = (typeof qsSaleStatusEnum.enumValues)[number]
export type QsPaymentMethod = (typeof qsPaymentMethodEnum.enumValues)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Relations (enables db.query…findMany({ with: { … } }))
// ─────────────────────────────────────────────────────────────────────────────

export const storesRelations = relations(stores, ({ one, many }) => ({
  owner: one(users, { fields: [stores.userId], references: [users.id] }),
  members: many(storeMembers),
  items: many(storeItems),
  sales: many(qsHistory),
}))

export const storeMembersRelations = relations(storeMembers, ({ one }) => ({
  store: one(stores, { fields: [storeMembers.storeId], references: [stores.id] }),
  user: one(users, { fields: [storeMembers.userId], references: [users.id] }),
  inviter: one(users, { fields: [storeMembers.invitedBy], references: [users.id] }),
}))

export const storeItemsRelations = relations(storeItems, ({ one, many }) => ({
  store: one(stores, { fields: [storeItems.storeId], references: [stores.id] }),
  creator: one(users, { fields: [storeItems.userId], references: [users.id] }),
  saleLines: many(qsHistoryItems),
}))

export const qsHistoryRelations = relations(qsHistory, ({ one, many }) => ({
  store: one(stores, { fields: [qsHistory.storeId], references: [stores.id] }),
  cashier: one(users, { fields: [qsHistory.cashierId], references: [users.id] }),
  lines: many(qsHistoryItems),
}))

export const qsHistoryItemsRelations = relations(qsHistoryItems, ({ one }) => ({
  sale: one(qsHistory, { fields: [qsHistoryItems.historyId], references: [qsHistory.id] }),
  item: one(storeItems, { fields: [qsHistoryItems.itemId], references: [storeItems.id] }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  ownedStores: many(stores),
  storeMembers: many(storeMembers),
  storeItems: many(storeItems),
  sales: many(qsHistory),
}))

// POS — restaurant-grade ordering domain. This is deliberately separate from
// QuickStore: orders may be started by anonymous guests and progress through a
// kitchen workflow before a cashier records payment.
export const posCurrencyEnum = pgEnum("pos_currency", ["IDR", "USD"])
export const posMemberRoleEnum = pgEnum("pos_member_role", ["owner", "manager", "cashier", "kitchen", "inventory", "viewer"])
export const posOrderStatusEnum = pgEnum("pos_order_status", ["draft", "submitted", "accepted", "preparing", "ready", "completed", "cancelled", "expired"])
export const posPaymentStatusEnum = pgEnum("pos_payment_status", ["unpaid", "pending_confirmation", "paid", "voided"])
export const posInviteStatusEnum = pgEnum("pos_invite_status", ["pending", "accepted", "revoked", "expired"])
export const posStockMovementEnum = pgEnum("pos_stock_movement", ["opening", "adjustment", "sale", "return", "waste"])

export const posStores = pgTable("pos_stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  slug: varchar("slug", { length: 48 }).notNull(),
  name: varchar("name", { length: 20 }).notNull(),
  description: varchar("description", { length: 100 }),
  imageUrl: text("image_url"),
  telephone: varchar("telephone", { length: 24 }),
  address: varchar("address", { length: 240 }),
  currency: posCurrencyEnum("currency").notNull().default("IDR"),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Jakarta"),
  isOpen: boolean("is_open").notNull().default(true),
  orderTokenVersion: integer("order_token_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pos_stores_slug_unique").on(t.slug), index("pos_stores_owner_idx").on(t.ownerId)])

export const posRoles = pgTable("pos_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 48 }).notNull(),
  systemRole: posMemberRoleEnum("system_role"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pos_roles_store_name_unique").on(t.storeId, t.name)])

export const posMembers = pgTable("pos_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => posRoles.id, { onDelete: "restrict" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pos_members_store_user_unique").on(t.storeId, t.userId), index("pos_members_user_idx").on(t.userId)])

export const posInvites = pgTable("pos_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => posRoles.id, { onDelete: "restrict" }),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  status: posInviteStatusEnum("status").notNull().default("pending"),
  invitedBy: text("invited_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pos_invites_token_unique").on(t.tokenHash), index("pos_invites_store_email_idx").on(t.storeId, t.email), index("pos_invites_expiry_idx").on(t.status, t.expiresAt)])

export const posCategories = pgTable("pos_categories", {
  id: uuid("id").primaryKey().defaultRandom(), storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 48 }).notNull(), description: varchar("description", { length: 140 }), imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0), active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pos_categories_store_name_unique").on(t.storeId, t.name), index("pos_categories_store_active_idx").on(t.storeId, t.active, t.sortOrder)])

export const posItems = pgTable("pos_items", {
  id: uuid("id").primaryKey().defaultRandom(), storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "cascade" }), categoryId: uuid("category_id").references(() => posCategories.id, { onDelete: "set null" }),
  sku: varchar("sku", { length: 64 }), name: varchar("name", { length: 80 }).notNull(), description: varchar("description", { length: 500 }), imageUrl: text("image_url"),
  price: numeric("price", { precision: 18, scale: 2 }).notNull(), available: boolean("available").notNull().default(true), trackStock: boolean("track_stock").notNull().default(true), stockOnHand: integer("stock_on_hand").notNull().default(0), lowStockAt: integer("low_stock_at").notNull().default(0), prepStation: varchar("prep_station", { length: 48 }), version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("pos_items_store_sku_unique").on(t.storeId, t.sku), index("pos_items_catalog_idx").on(t.storeId, t.available, t.categoryId), index("pos_items_stock_idx").on(t.storeId, t.trackStock, t.stockOnHand), check("pos_items_nonnegative_stock", sql`${t.stockOnHand} >= 0`)])

export const posOrders = pgTable("pos_orders", {
  id: uuid("id").primaryKey().defaultRandom(), storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "restrict" }),
  orderNumber: varchar("order_number", { length: 32 }).notNull(), accessCode: varchar("access_code", { length: 12 }).notNull(), customerName: varchar("customer_name", { length: 80 }).notNull(), status: posOrderStatusEnum("status").notNull().default("draft"), paymentStatus: posPaymentStatusEnum("payment_status").notNull().default("unpaid"),
  currency: posCurrencyEnum("currency").notNull(), subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull().default("0"), total: numeric("total", { precision: 18, scale: 2 }).notNull().default("0"), note: varchar("note", { length: 500 }), version: integer("version").notNull().default(1), cashierId: text("cashier_id").references(() => users.id, { onDelete: "set null" }), paidAt: timestamp("paid_at", { withTimezone: true }), codeUsedAt: timestamp("code_used_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pos_orders_store_number_unique").on(t.storeId, t.orderNumber), uniqueIndex("pos_orders_access_code_unique").on(t.accessCode), index("pos_orders_kitchen_queue_idx").on(t.storeId, t.status, t.createdAt), index("pos_orders_cashier_lookup_idx").on(t.storeId, t.accessCode)])

export const posOrderItems = pgTable("pos_order_items", {
  id: uuid("id").primaryKey().defaultRandom(), orderId: uuid("order_id").notNull().references(() => posOrders.id, { onDelete: "cascade" }), itemId: uuid("item_id").references(() => posItems.id, { onDelete: "set null" }), nameSnapshot: varchar("name_snapshot", { length: 80 }).notNull(), unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(), quantity: integer("quantity").notNull(), modifiers: jsonb("modifiers").$type<{ name: string; price: string }[]>().notNull().default([]), note: varchar("note", { length: 240 }), lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull(), prepStatus: posOrderStatusEnum("prep_status").notNull().default("submitted"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("pos_order_items_order_idx").on(t.orderId), index("pos_order_items_item_idx").on(t.itemId), check("pos_order_items_positive_quantity", sql`${t.quantity} > 0`)])

export const posStockMovements = pgTable("pos_stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(), storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "restrict" }), itemId: uuid("item_id").notNull().references(() => posItems.id, { onDelete: "restrict" }), orderId: uuid("order_id").references(() => posOrders.id, { onDelete: "set null" }), type: posStockMovementEnum("type").notNull(), quantityDelta: integer("quantity_delta").notNull(), balanceAfter: integer("balance_after").notNull(), reason: varchar("reason", { length: 240 }), actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("pos_stock_movements_item_created_idx").on(t.itemId, t.createdAt.desc()), index("pos_stock_movements_order_idx").on(t.orderId)])

export const posAuditLogs = pgTable("pos_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(), storeId: uuid("store_id").notNull().references(() => posStores.id, { onDelete: "restrict" }), actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }), action: varchar("action", { length: 80 }).notNull(), entityType: varchar("entity_type", { length: 48 }).notNull(), entityId: uuid("entity_id"), payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("pos_audit_logs_store_created_idx").on(t.storeId, t.createdAt.desc()), index("pos_audit_logs_entity_idx").on(t.entityType, t.entityId)])

export type PosPermission = "store:manage" | "catalog:read" | "catalog:write" | "order:read" | "order:create" | "order:manage" | "payment:collect" | "kitchen:read" | "kitchen:update" | "inventory:read" | "inventory:write" | "member:manage" | "report:read"
