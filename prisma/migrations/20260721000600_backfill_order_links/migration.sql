UPDATE "Order"
SET "accessToken" = replace(gen_random_uuid()::text, '-', '')
WHERE "accessToken" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "accessToken" SET NOT NULL;
