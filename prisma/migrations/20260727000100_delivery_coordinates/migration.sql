-- Store precise coordinates without external geocoding services.
-- IF NOT EXISTS keeps this compatible with databases where earlier schema
-- synchronization already created the restaurant columns.
ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10,7);

ALTER TABLE "Restaurant"
  ALTER COLUMN "latitude" TYPE DECIMAL(10,7) USING "latitude"::DECIMAL(10,7),
  ALTER COLUMN "longitude" TYPE DECIMAL(10,7) USING "longitude"::DECIMAL(10,7);

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "deliveryLatitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "deliveryLongitude" DECIMAL(10,7);
