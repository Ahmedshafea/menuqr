ALTER TABLE "Order"
  ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "serviceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "Setting"
  ADD COLUMN "deliveryFeeType" TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "serviceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "serviceFeeType" TEXT NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "taxType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discountType" TEXT NOT NULL DEFAULT 'FIXED';

ALTER TABLE "Setting"
  ADD CONSTRAINT "Setting_deliveryFeeType_check"
    CHECK ("deliveryFeeType" IN ('FIXED', 'PERCENTAGE')),
  ADD CONSTRAINT "Setting_serviceFeeType_check"
    CHECK ("serviceFeeType" IN ('FIXED', 'PERCENTAGE')),
  ADD CONSTRAINT "Setting_taxType_check"
    CHECK ("taxType" IN ('FIXED', 'PERCENTAGE')),
  ADD CONSTRAINT "Setting_discountType_check"
    CHECK ("discountType" IN ('FIXED', 'PERCENTAGE'));
