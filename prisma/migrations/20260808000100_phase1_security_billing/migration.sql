ALTER TABLE "Plan" ADD COLUMN "lemonSqueezyVariantId" TEXT;
CREATE UNIQUE INDEX "Plan_lemonSqueezyVariantId_key" ON "Plan"("lemonSqueezyVariantId");

ALTER TABLE "Subscription"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerCustomerId" TEXT,
  ADD COLUMN "providerSubscriptionId" TEXT,
  ADD COLUMN "providerOrderId" TEXT,
  ADD COLUMN "providerVariantId" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerUpdatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

ALTER TABLE "Payment"
  ADD COLUMN "providerOrderId" TEXT,
  ADD COLUMN "providerSubscriptionId" TEXT,
  ADD COLUMN "providerEventId" TEXT;

CREATE TABLE "BillingEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "resourceId" TEXT,
  "occurredAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingEvent_provider_providerEventId_key" ON "BillingEvent"("provider", "providerEventId");
CREATE INDEX "BillingEvent_provider_resourceId_occurredAt_idx" ON "BillingEvent"("provider", "resourceId", "occurredAt");

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
