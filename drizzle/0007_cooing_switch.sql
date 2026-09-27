UPDATE "stores" SET "description" = left("description", 50) WHERE length("description") > 50;--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "description" SET DATA TYPE varchar(50);