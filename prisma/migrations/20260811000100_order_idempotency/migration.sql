-- A client-generated request identifier makes public order creation safely
-- retryable after timeouts or lost responses without changing existing rows.
ALTER TABLE "Order" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Order_restaurantId_clientRequestId_key"
ON "Order"("restaurantId", "clientRequestId");
