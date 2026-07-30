-- Promotion and coupon management.
CREATE TYPE "PromotionType" AS ENUM (
  'PERCENTAGE',
  'FIXED_AMOUNT',
  'BUY_X_GET_Y',
  'FREE_ITEM',
  'FREE_DELIVERY'
);

CREATE TYPE "PromotionTargetType" AS ENUM (
  'ORDER',
  'PRODUCT',
  'CATEGORY',
  'BRANCH',
  'RESTAURANT',
  'COLLECTION'
);

CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "PromotionStackingRule" AS ENUM ('ALLOW', 'PREVENT', 'HIGHEST_WINS');

ALTER TABLE "Order"
  ADD COLUMN "couponCode" TEXT,
  ADD COLUMN "originalSubtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "finalSubtotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "Order"
SET
  "originalSubtotal" = "subtotal",
  "finalSubtotal" = GREATEST(0, "subtotal" - "discountAmount");

CREATE TABLE "Promotion" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameAr" TEXT,
  "description" TEXT,
  "descriptionAr" TEXT,
  "type" "PromotionType" NOT NULL,
  "targetType" "PromotionTargetType" NOT NULL DEFAULT 'ORDER',
  "value" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "buyQuantity" INTEGER,
  "getQuantity" INTEGER,
  "freeProductId" TEXT,
  "minimumOrderValue" DECIMAL(10,2),
  "maximumDiscount" DECIMAL(10,2),
  "minimumQuantity" INTEGER,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "startTime" TEXT,
  "endTime" TEXT,
  "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
  "newCustomersOnly" BOOLEAN NOT NULL DEFAULT false,
  "returningOnly" BOOLEAN NOT NULL DEFAULT false,
  "totalUsageLimit" INTEGER,
  "perCustomerLimit" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "requiresCoupon" BOOLEAN NOT NULL DEFAULT false,
  "autoApply" BOOLEAN NOT NULL DEFAULT true,
  "allowStacking" BOOLEAN NOT NULL DEFAULT false,
  "stackingRule" "PromotionStackingRule" NOT NULL DEFAULT 'HIGHEST_WINS',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "exclusive" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionProduct" (
  "promotionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "PromotionProduct_pkey" PRIMARY KEY ("promotionId", "productId")
);

CREATE TABLE "PromotionCategory" (
  "promotionId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "PromotionCategory_pkey" PRIMARY KEY ("promotionId", "categoryId")
);

CREATE TABLE "PromotionBranch" (
  "promotionId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  CONSTRAINT "PromotionBranch_pkey" PRIMARY KEY ("promotionId", "branchId")
);

CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "maximumUsage" INTEGER,
  "perCustomerLimit" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionUsage" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "couponId" TEXT,
  "orderId" TEXT NOT NULL,
  "customerUserId" TEXT,
  "customerKey" TEXT,
  "discountAmount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionOrder" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "promotionId" TEXT,
  "couponId" TEXT,
  "promotionName" TEXT NOT NULL,
  "promotionType" "PromotionType" NOT NULL,
  "discountAmount" DECIMAL(10,2) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Promotion_restaurantId_status_isActive_idx" ON "Promotion"("restaurantId", "status", "isActive");
CREATE INDEX "Promotion_restaurantId_startsAt_endsAt_idx" ON "Promotion"("restaurantId", "startsAt", "endsAt");
CREATE INDEX "Promotion_restaurantId_priority_idx" ON "Promotion"("restaurantId", "priority");
CREATE INDEX "PromotionProduct_productId_idx" ON "PromotionProduct"("productId");
CREATE INDEX "PromotionCategory_categoryId_idx" ON "PromotionCategory"("categoryId");
CREATE INDEX "PromotionBranch_branchId_idx" ON "PromotionBranch"("branchId");
CREATE UNIQUE INDEX "Coupon_restaurantId_code_key" ON "Coupon"("restaurantId", "code");
CREATE INDEX "Coupon_restaurantId_isActive_expiresAt_idx" ON "Coupon"("restaurantId", "isActive", "expiresAt");
CREATE INDEX "Coupon_promotionId_idx" ON "Coupon"("promotionId");
CREATE UNIQUE INDEX "PromotionUsage_promotionId_orderId_key" ON "PromotionUsage"("promotionId", "orderId");
CREATE INDEX "PromotionUsage_restaurantId_createdAt_idx" ON "PromotionUsage"("restaurantId", "createdAt");
CREATE INDEX "PromotionUsage_promotionId_customerUserId_idx" ON "PromotionUsage"("promotionId", "customerUserId");
CREATE INDEX "PromotionUsage_promotionId_customerKey_idx" ON "PromotionUsage"("promotionId", "customerKey");
CREATE INDEX "PromotionUsage_couponId_createdAt_idx" ON "PromotionUsage"("couponId", "createdAt");
CREATE UNIQUE INDEX "PromotionOrder_orderId_promotionId_key" ON "PromotionOrder"("orderId", "promotionId");
CREATE INDEX "PromotionOrder_orderId_idx" ON "PromotionOrder"("orderId");
CREATE INDEX "PromotionOrder_promotionId_createdAt_idx" ON "PromotionOrder"("promotionId", "createdAt");
CREATE INDEX "PromotionOrder_couponId_createdAt_idx" ON "PromotionOrder"("couponId", "createdAt");

ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_freeProductId_fkey" FOREIGN KEY ("freeProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionProduct" ADD CONSTRAINT "PromotionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionCategory" ADD CONSTRAINT "PromotionCategory_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionCategory" ADD CONSTRAINT "PromotionCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionBranch" ADD CONSTRAINT "PromotionBranch_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionBranch" ADD CONSTRAINT "PromotionBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionUsage" ADD CONSTRAINT "PromotionUsage_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionUsage" ADD CONSTRAINT "PromotionUsage_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionUsage" ADD CONSTRAINT "PromotionUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionUsage" ADD CONSTRAINT "PromotionUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionUsage" ADD CONSTRAINT "PromotionUsage_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionOrder" ADD CONSTRAINT "PromotionOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionOrder" ADD CONSTRAINT "PromotionOrder_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionOrder" ADD CONSTRAINT "PromotionOrder_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
