CREATE INDEX "store_items_store_idx" ON "store_items" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_members_user_idx" ON "store_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stores_user_idx" ON "stores" USING btree ("user_id");