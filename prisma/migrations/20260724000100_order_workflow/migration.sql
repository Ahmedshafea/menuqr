ALTER TYPE "OrderStatus" RENAME VALUE 'PENDING' TO 'NEW';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FAILED_DELIVERY';

ALTER TABLE "Setting" ADD COLUMN "allowOrdersOutsideHours" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderItem" ADD COLUMN "isComplimentary" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderActionLog" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderActionLog_pkey" PRIMARY KEY ("id")
);
INSERT INTO "OrderStatusHistory" ("id", "orderId", "status", "createdAt")
SELECT 'initial_' || "id", "id", "status", "createdAt" FROM "Order";
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");
CREATE INDEX "OrderActionLog_orderId_createdAt_idx" ON "OrderActionLog"("orderId", "createdAt");
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderActionLog" ADD CONSTRAINT "OrderActionLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderActionLog" ADD CONSTRAINT "OrderActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderStatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderActionLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_order_status_history" ON "OrderStatusHistory" FOR ALL USING (EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId" AND o."restaurantId" = public.current_restaurant_id())) WITH CHECK (EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId" AND o."restaurantId" = public.current_restaurant_id()));
CREATE POLICY "tenant_order_action_logs" ON "OrderActionLog" FOR ALL USING (EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId" AND o."restaurantId" = public.current_restaurant_id())) WITH CHECK (EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId" AND o."restaurantId" = public.current_restaurant_id()));
