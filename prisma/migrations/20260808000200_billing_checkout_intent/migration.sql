CREATE TYPE "BillingCheckoutIntentStatus" AS ENUM ('PENDING', 'CONSUMED', 'FAILED');

CREATE TABLE "BillingCheckoutIntent" (
  "id" TEXT NOT NULL,
  "publicIntentId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "initiatingUserId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "status" "BillingCheckoutIntentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingCheckoutIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCheckoutIntent_publicIntentId_key" ON "BillingCheckoutIntent"("publicIntentId");
CREATE INDEX "BillingCheckoutIntent_restaurantId_status_expiresAt_idx" ON "BillingCheckoutIntent"("restaurantId", "status", "expiresAt");
CREATE INDEX "BillingCheckoutIntent_initiatingUserId_status_idx" ON "BillingCheckoutIntent"("initiatingUserId", "status");
CREATE INDEX "BillingCheckoutIntent_expiresAt_idx" ON "BillingCheckoutIntent"("expiresAt");

ALTER TABLE "BillingCheckoutIntent" ADD CONSTRAINT "BillingCheckoutIntent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCheckoutIntent" ADD CONSTRAINT "BillingCheckoutIntent_initiatingUserId_fkey" FOREIGN KEY ("initiatingUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCheckoutIntent" ADD CONSTRAINT "BillingCheckoutIntent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
