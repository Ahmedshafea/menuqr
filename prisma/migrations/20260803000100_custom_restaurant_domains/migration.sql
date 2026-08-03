CREATE TYPE "CustomDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'ERROR');

CREATE TABLE "CustomDomain" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "status" "CustomDomainStatus" NOT NULL DEFAULT 'PENDING',
  "verification" JSONB,
  "lastError" TEXT,
  "lastCheckedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomDomain_restaurantId_key" ON "CustomDomain"("restaurantId");
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");
CREATE INDEX "CustomDomain_status_domain_idx" ON "CustomDomain"("status", "domain");

ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
