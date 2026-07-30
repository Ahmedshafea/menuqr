ALTER TABLE "Branch"
  RENAME COLUMN "mapUrl" TO "googleMapsUrl";

ALTER TABLE "Branch"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "whatsappNumber" TEXT,
  ADD COLUMN "useRestaurantWhatsapp" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "latitude" DECIMAL(10,7),
  ADD COLUMN "longitude" DECIMAL(10,7),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing branches receive stable, collision-free slugs. Owners can replace
-- these friendly slugs later from Branch settings.
UPDATE "Branch"
SET "slug" = 'branch-' || lower(substr("id", 1, 10))
WHERE "slug" IS NULL;

ALTER TABLE "Branch"
  ALTER COLUMN "slug" SET NOT NULL;

INSERT INTO "Branch" (
  "id", "restaurantId", "name", "slug", "phone", "address",
  "useRestaurantWhatsapp", "isActive", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || substr(md5(r."id"), 1, 20),
  r."id",
  r."name",
  'main',
  r."phone",
  COALESCE(r."address", ''),
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Restaurant" r
WHERE NOT EXISTS (
  SELECT 1 FROM "Branch" b WHERE b."restaurantId" = r."id"
);

INSERT INTO "WorkingHour" (
  "id", "branchId", "dayOfWeek", "opensAt", "closesAt", "isClosed"
)
SELECT
  'legacy_hour_' || substr(md5(b."id" || d::text), 1, 18),
  b."id",
  d,
  '00:00',
  '23:59',
  false
FROM "Branch" b
CROSS JOIN generate_series(0, 6) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkingHour" wh WHERE wh."branchId" = b."id"
);

ALTER TABLE "Order"
  DROP CONSTRAINT IF EXISTS "Order_branchId_fkey";

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Branch_restaurantId_slug_key"
  ON "Branch"("restaurantId", "slug");
CREATE INDEX "Branch_restaurantId_updatedAt_idx"
  ON "Branch"("restaurantId", "updatedAt");
CREATE INDEX "Order_branchId_createdAt_idx"
  ON "Order"("branchId", "createdAt");
