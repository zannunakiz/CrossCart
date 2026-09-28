-- Data guards run first: the new unique index cannot be created while legacy
-- rows still collide.
UPDATE "store_items" SET "name" = btrim("name") WHERE "name" <> btrim("name");--> statement-breakpoint
DO $$
DECLARE
  dup record;
  suffix integer;
  candidate varchar(20);
BEGIN
  FOR dup IN
    SELECT id, store_id, name
    FROM (
      SELECT id, store_id, name,
             row_number() OVER (
               PARTITION BY store_id, lower(name)
               ORDER BY created_at, id
             ) AS rn
      FROM "store_items"
    ) ranked
    WHERE rn > 1
  LOOP
    suffix := 2;
    candidate := left(dup.name, 20 - length(' (' || suffix || ')')) || ' (' || suffix || ')';
    WHILE EXISTS (
      SELECT 1 FROM "store_items"
      WHERE store_id = dup.store_id
        AND id <> dup.id
        AND lower(name) = lower(candidate)
    ) LOOP
      suffix := suffix + 1;
      candidate := left(dup.name, 20 - length(' (' || suffix || ')')) || ' (' || suffix || ')';
    END LOOP;
    UPDATE "store_items"
    SET "name" = candidate, "updated_at" = now()
    WHERE id = dup.id;
  END LOOP;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "store_items_store_name_unique" ON "store_items" USING btree ("store_id",lower("name"));