ALTER TABLE "Restaurant"
  ADD COLUMN "governorate" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "area" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "postalCode" TEXT;

ALTER TABLE "Branch"
  ADD COLUMN "governorate" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "area" TEXT,
  ADD COLUMN "street" TEXT;

UPDATE "Branch"
SET "governorate" = "state"
WHERE "governorate" IS NULL AND "state" IS NOT NULL;
