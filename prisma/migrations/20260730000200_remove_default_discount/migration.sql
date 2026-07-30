-- The promotion engine is now the only source of discounts.
-- Order.discountAmount remains because it stores the final applied promotion
-- discount as an immutable order value.
ALTER TABLE "Setting"
  DROP CONSTRAINT IF EXISTS "Setting_discountType_check",
  DROP COLUMN IF EXISTS "discountValue",
  DROP COLUMN IF EXISTS "discountType";
