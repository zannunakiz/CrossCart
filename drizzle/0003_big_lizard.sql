CREATE TYPE "public"."qs_payment_method" AS ENUM('qr', 'cash');--> statement-breakpoint
CREATE TYPE "public"."qs_sale_status" AS ENUM('completed', 'voided');--> statement-breakpoint
CREATE TABLE "qs_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"cashier_id" text,
	"receipt_number" varchar(24) NOT NULL,
	"status" "qs_sale_status" DEFAULT 'completed' NOT NULL,
	"currency" "currency_type" DEFAULT 'IDR' NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"discount_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"line_count" integer NOT NULL,
	"item_count" integer NOT NULL,
	"payment_method" "qs_payment_method" DEFAULT 'qr' NOT NULL,
	"note" varchar(140),
	"client_request_id" varchar(64),
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qs_history_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"history_id" uuid NOT NULL,
	"item_id" uuid,
	"name" varchar(20) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount_percent" integer DEFAULT 0 NOT NULL,
	"unit_price_paid" numeric(18, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" numeric(18, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qs_history_items_quantity_check" CHECK ("qs_history_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "qs_history" ADD CONSTRAINT "qs_history_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qs_history" ADD CONSTRAINT "qs_history_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qs_history_items" ADD CONSTRAINT "qs_history_items_history_id_qs_history_id_fk" FOREIGN KEY ("history_id") REFERENCES "public"."qs_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qs_history_items" ADD CONSTRAINT "qs_history_items_item_id_store_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."store_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qs_history_store_receipt_unique" ON "qs_history" USING btree ("store_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "qs_history_client_request_unique" ON "qs_history" USING btree ("client_request_id");--> statement-breakpoint
CREATE INDEX "qs_history_store_paid_at_idx" ON "qs_history" USING btree ("store_id","paid_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "qs_history_cashier_idx" ON "qs_history" USING btree ("cashier_id");--> statement-breakpoint
CREATE INDEX "qs_history_items_history_idx" ON "qs_history_items" USING btree ("history_id");--> statement-breakpoint
CREATE INDEX "qs_history_items_item_idx" ON "qs_history_items" USING btree ("item_id");