CREATE TYPE "ProductAvailability" AS ENUM ('AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'HIDDEN');
CREATE TYPE "RestaurantNotificationType" AS ENUM ('NEW_ORDER', 'APPROVAL_REQUIRED', 'OUT_OF_STOCK', 'NEW_CUSTOMER', 'FIRST_QR_SCAN');

ALTER TABLE "Product"
  ADD COLUMN "availability" "ProductAvailability" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "lowStockThreshold" INTEGER;

UPDATE "Product"
SET "availability" = CASE
  WHEN "isAvailable" THEN 'AVAILABLE'::"ProductAvailability"
  ELSE 'HIDDEN'::"ProductAvailability"
END;

ALTER TABLE "Setting"
  ADD COLUMN "inventoryTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "setupChecklistDismissed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "RestaurantNotification" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "type" "RestaurantNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "href" TEXT,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantNotificationRead" (
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantNotificationRead_pkey" PRIMARY KEY ("notificationId", "userId")
);

CREATE UNIQUE INDEX "RestaurantNotification_restaurantId_dedupeKey_key"
  ON "RestaurantNotification"("restaurantId", "dedupeKey");
CREATE INDEX "RestaurantNotification_restaurantId_createdAt_idx"
  ON "RestaurantNotification"("restaurantId", "createdAt");
CREATE INDEX "RestaurantNotificationRead_userId_readAt_idx"
  ON "RestaurantNotificationRead"("userId", "readAt");

ALTER TABLE "RestaurantNotification"
  ADD CONSTRAINT "RestaurantNotification_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantNotificationRead"
  ADD CONSTRAINT "RestaurantNotificationRead_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "RestaurantNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantNotificationRead"
  ADD CONSTRAINT "RestaurantNotificationRead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestaurantNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantNotificationRead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_restaurant_notifications" ON "RestaurantNotification"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_restaurant_notification_reads" ON "RestaurantNotificationRead"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
