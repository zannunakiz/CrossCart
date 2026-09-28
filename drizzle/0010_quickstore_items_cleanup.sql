-- Data guards run first: a live catalog may hold rows that would make the
-- narrower column / new check constraints fail.
UPDATE "store_items" SET "description" = left("description", 50) WHERE "description" IS NOT NULL AND length("description") > 50;--> statement-breakpoint
ALTER TABLE "store_items" ALTER COLUMN "description" SET DATA TYPE varchar(50) USING left("description", 50);--> statement-breakpoint
UPDATE "store_items" SET "stocks" = 999 WHERE "stocks" > 999;--> statement-breakpoint
UPDATE "store_items" SET "discount_percent" = 100 WHERE "discount_percent" > 100;--> statement-breakpoint
UPDATE "store_items" SET "discount_percent" = 0 WHERE "discount_percent" < 0;--> statement-breakpoint
ALTER TABLE "store_items" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "store_items" DROP COLUMN "highlight";--> statement-breakpoint
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_stocks_range" CHECK ("store_items"."stocks" is null or ("store_items"."stocks" >= 0 and "store_items"."stocks" <= 999));--> statement-breakpoint
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_discount_range" CHECK ("store_items"."discount_percent" >= 0 and "store_items"."discount_percent" <= 100);