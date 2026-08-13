ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ImportOperationLease" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportOperationLease_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "ImportOperationLease_expiresAt_idx" ON "ImportOperationLease"("expiresAt");
CREATE INDEX "ImportOperationLease_restaurantId_expiresAt_idx" ON "ImportOperationLease"("restaurantId", "expiresAt");
CREATE INDEX "ImportOperationLease_userId_expiresAt_idx" ON "ImportOperationLease"("userId", "expiresAt");
