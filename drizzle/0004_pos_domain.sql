CREATE TYPE "public"."pos_currency" AS ENUM('IDR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."pos_invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."pos_member_role" AS ENUM('owner', 'manager', 'cashier', 'kitchen', 'inventory', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."pos_order_status" AS ENUM('draft', 'submitted', 'accepted', 'preparing', 'ready', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."pos_payment_status" AS ENUM('unpaid', 'pending_confirmation', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."pos_stock_movement" AS ENUM('opening', 'adjustment', 'sale', 'return', 'waste');--> statement-breakpoint
CREATE TABLE "pos_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"actor_id" text,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(48) NOT NULL,
	"entity_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(48) NOT NULL,
	"description" varchar(140),
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"status" "pos_invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid,
	"sku" varchar(64),
	"name" varchar(80) NOT NULL,
	"description" varchar(500),
	"image_url" text,
	"price" numeric(18, 2) NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"track_stock" boolean DEFAULT true NOT NULL,
	"stock_on_hand" integer DEFAULT 0 NOT NULL,
	"low_stock_at" integer DEFAULT 0 NOT NULL,
	"prep_station" varchar(48),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pos_items_nonnegative_stock" CHECK ("pos_items"."stock_on_hand" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pos_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid,
	"name_snapshot" varchar(80) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" varchar(240),
	"line_total" numeric(18, 2) NOT NULL,
	"prep_status" "pos_order_status" DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_order_items_positive_quantity" CHECK ("pos_order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "pos_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"access_code" varchar(12) NOT NULL,
	"customer_name" varchar(80) NOT NULL,
	"status" "pos_order_status" DEFAULT 'draft' NOT NULL,
	"payment_status" "pos_payment_status" DEFAULT 'unpaid' NOT NULL,
	"currency" "pos_currency" NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"note" varchar(500),
	"version" integer DEFAULT 1 NOT NULL,
	"cashier_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(48) NOT NULL,
	"system_role" "pos_member_role",
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"order_id" uuid,
	"type" "pos_stock_movement" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" varchar(240),
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"slug" varchar(48) NOT NULL,
	"name" varchar(20) NOT NULL,
	"description" varchar(100),
	"image_url" text,
	"telephone" varchar(24),
	"address" varchar(240),
	"currency" "pos_currency" DEFAULT 'IDR' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Jakarta' NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"order_token_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pos_audit_logs" ADD CONSTRAINT "pos_audit_logs_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_audit_logs" ADD CONSTRAINT "pos_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_categories" ADD CONSTRAINT "pos_categories_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_invites" ADD CONSTRAINT "pos_invites_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_invites" ADD CONSTRAINT "pos_invites_role_id_pos_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."pos_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_invites" ADD CONSTRAINT "pos_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_items" ADD CONSTRAINT "pos_items_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_items" ADD CONSTRAINT "pos_items_category_id_pos_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."pos_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_members" ADD CONSTRAINT "pos_members_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_members" ADD CONSTRAINT "pos_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_members" ADD CONSTRAINT "pos_members_role_id_pos_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."pos_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_items" ADD CONSTRAINT "pos_order_items_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_order_items" ADD CONSTRAINT "pos_order_items_item_id_pos_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pos_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_orders" ADD CONSTRAINT "pos_orders_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_roles" ADD CONSTRAINT "pos_roles_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_store_id_pos_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pos_stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_item_id_pos_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pos_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."pos_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_stock_movements" ADD CONSTRAINT "pos_stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_stores" ADD CONSTRAINT "pos_stores_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pos_audit_logs_store_created_idx" ON "pos_audit_logs" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pos_audit_logs_entity_idx" ON "pos_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_categories_store_name_unique" ON "pos_categories" USING btree ("store_id","name");--> statement-breakpoint
CREATE INDEX "pos_categories_store_active_idx" ON "pos_categories" USING btree ("store_id","active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_invites_token_unique" ON "pos_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "pos_invites_store_email_idx" ON "pos_invites" USING btree ("store_id","email");--> statement-breakpoint
CREATE INDEX "pos_invites_expiry_idx" ON "pos_invites" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_items_store_sku_unique" ON "pos_items" USING btree ("store_id","sku");--> statement-breakpoint
CREATE INDEX "pos_items_catalog_idx" ON "pos_items" USING btree ("store_id","available","category_id");--> statement-breakpoint
CREATE INDEX "pos_items_stock_idx" ON "pos_items" USING btree ("store_id","track_stock","stock_on_hand");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_members_store_user_unique" ON "pos_members" USING btree ("store_id","user_id");--> statement-breakpoint
CREATE INDEX "pos_members_user_idx" ON "pos_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pos_order_items_order_idx" ON "pos_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "pos_order_items_item_idx" ON "pos_order_items" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_orders_store_number_unique" ON "pos_orders" USING btree ("store_id","order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_orders_access_code_unique" ON "pos_orders" USING btree ("access_code");--> statement-breakpoint
CREATE INDEX "pos_orders_kitchen_queue_idx" ON "pos_orders" USING btree ("store_id","status","created_at");--> statement-breakpoint
CREATE INDEX "pos_orders_cashier_lookup_idx" ON "pos_orders" USING btree ("store_id","access_code");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_roles_store_name_unique" ON "pos_roles" USING btree ("store_id","name");--> statement-breakpoint
CREATE INDEX "pos_stock_movements_item_created_idx" ON "pos_stock_movements" USING btree ("item_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pos_stock_movements_order_idx" ON "pos_stock_movements" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pos_stores_slug_unique" ON "pos_stores" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pos_stores_owner_idx" ON "pos_stores" USING btree ("owner_id");