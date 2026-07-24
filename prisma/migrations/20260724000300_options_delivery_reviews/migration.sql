ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED_TO_DRIVER' BEFORE 'OUT_FOR_DELIVERY';
ALTER TYPE "RestaurantNotificationType" ADD VALUE IF NOT EXISTS 'NEW_REVIEW';
ALTER TYPE "RestaurantNotificationType" ADD VALUE IF NOT EXISTS 'LOW_RATING';
ALTER TYPE "RestaurantNotificationType" ADD VALUE IF NOT EXISTS 'DRIVER_ASSIGNED';
ALTER TYPE "RestaurantNotificationType" ADD VALUE IF NOT EXISTS 'DRIVER_CHANGED';
ALTER TYPE "RestaurantNotificationType" ADD VALUE IF NOT EXISTS 'DELIVERY_COMPLETED';
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP', 'DINE_IN');
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN');

ALTER TABLE "Setting" ADD COLUMN "offersDelivery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "offersPickup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "offersDineIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "driverId" TEXT,
ADD COLUMN "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'DELIVERY',
ADD COLUMN "driverAssignedAt" TIMESTAMP(3),
ADD COLUMN "outForDeliveryAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "estimatedArrivalAt" TIMESTAMP(3);

CREATE TABLE "ProductOptionGroup" ("id" TEXT PRIMARY KEY,"restaurantId" TEXT NOT NULL,"name" TEXT NOT NULL,"nameAr" TEXT,"description" TEXT,"descriptionAr" TEXT,"isRequired" BOOLEAN NOT NULL DEFAULT false,"minSelections" INTEGER NOT NULL DEFAULT 0,"maxSelections" INTEGER NOT NULL DEFAULT 1,"sortOrder" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "ProductOption" ("id" TEXT PRIMARY KEY,"restaurantId" TEXT NOT NULL,"name" TEXT NOT NULL,"nameAr" TEXT,"description" TEXT,"descriptionAr" TEXT,"priceAdjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,"isAvailable" BOOLEAN NOT NULL DEFAULT true,"sortOrder" INTEGER NOT NULL DEFAULT 0,"standaloneProductId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "ProductOptionGroupItem" ("groupId" TEXT NOT NULL,"optionId" TEXT NOT NULL,"sortOrder" INTEGER NOT NULL DEFAULT 0,PRIMARY KEY("groupId","optionId"));
CREATE TABLE "ProductOptionGroupProduct" ("groupId" TEXT NOT NULL,"productId" TEXT NOT NULL,"sortOrder" INTEGER NOT NULL DEFAULT 0,PRIMARY KEY("groupId","productId"));
CREATE TABLE "OrderItemOption" ("id" TEXT PRIMARY KEY,"orderItemId" TEXT NOT NULL,"optionId" TEXT,"name" TEXT NOT NULL,"price" DECIMAL(10,2) NOT NULL);
CREATE TABLE "DeliveryDriver" ("id" TEXT PRIMARY KEY,"restaurantId" TEXT NOT NULL,"name" TEXT NOT NULL,"phone" TEXT NOT NULL,"whatsapp" TEXT,"photoUrl" TEXT,"vehicleType" TEXT,"status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "RestaurantReview" ("id" TEXT PRIMARY KEY,"restaurantId" TEXT NOT NULL,"orderId" TEXT NOT NULL,"customerUserId" TEXT,"foodQuality" INTEGER NOT NULL,"deliverySpeed" INTEGER NOT NULL,"packaging" INTEGER NOT NULL,"overall" INTEGER NOT NULL,"comment" TEXT,"status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',"publishedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);

CREATE INDEX "ProductOptionGroup_restaurantId_sortOrder_idx" ON "ProductOptionGroup"("restaurantId","sortOrder");
CREATE INDEX "ProductOption_restaurantId_isAvailable_sortOrder_idx" ON "ProductOption"("restaurantId","isAvailable","sortOrder");
CREATE INDEX "ProductOption_standaloneProductId_idx" ON "ProductOption"("standaloneProductId");
CREATE INDEX "ProductOptionGroupItem_optionId_idx" ON "ProductOptionGroupItem"("optionId");
CREATE INDEX "ProductOptionGroupProduct_productId_sortOrder_idx" ON "ProductOptionGroupProduct"("productId","sortOrder");
CREATE INDEX "OrderItemOption_orderItemId_idx" ON "OrderItemOption"("orderItemId");
CREATE INDEX "OrderItemOption_optionId_idx" ON "OrderItemOption"("optionId");
CREATE INDEX "DeliveryDriver_restaurantId_status_idx" ON "DeliveryDriver"("restaurantId","status");
CREATE UNIQUE INDEX "RestaurantReview_orderId_key" ON "RestaurantReview"("orderId");
CREATE INDEX "RestaurantReview_restaurantId_status_createdAt_idx" ON "RestaurantReview"("restaurantId","status","createdAt");
CREATE INDEX "RestaurantReview_restaurantId_overall_idx" ON "RestaurantReview"("restaurantId","overall");
CREATE INDEX "Order_restaurantId_fulfillmentType_createdAt_idx" ON "Order"("restaurantId","fulfillmentType","createdAt");
CREATE INDEX "Order_driverId_status_idx" ON "Order"("driverId","status");

ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_standaloneProductId_fkey" FOREIGN KEY ("standaloneProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroupItem" ADD CONSTRAINT "ProductOptionGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroupItem" ADD CONSTRAINT "ProductOptionGroupItem_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroupProduct" ADD CONSTRAINT "ProductOptionGroupProduct_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroupProduct" ADD CONSTRAINT "ProductOptionGroupProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryDriver" ADD CONSTRAINT "DeliveryDriver_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DeliveryDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RestaurantReview" ADD CONSTRAINT "RestaurantReview_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantReview" ADD CONSTRAINT "RestaurantReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductOptionGroup" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ProductOption" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ProductOptionGroupItem" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ProductOptionGroupProduct" ENABLE ROW LEVEL SECURITY; ALTER TABLE "OrderItemOption" ENABLE ROW LEVEL SECURITY; ALTER TABLE "DeliveryDriver" ENABLE ROW LEVEL SECURITY; ALTER TABLE "RestaurantReview" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_options_groups" ON "ProductOptionGroup" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_options" ON "ProductOption" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_option_items" ON "ProductOptionGroupItem" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_option_products" ON "ProductOptionGroupProduct" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_order_options" ON "OrderItemOption" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_drivers" ON "DeliveryDriver" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_reviews" ON "RestaurantReview" FOR ALL TO service_role USING (true) WITH CHECK (true);
