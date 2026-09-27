ALTER TABLE "store_items" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "qs_history" ADD COLUMN "cashier_name" varchar(80);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "stores_deleted_idx" ON "stores" USING btree ("deleted_at");