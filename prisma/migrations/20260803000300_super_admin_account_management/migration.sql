ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "User_isActive_createdAt_idx" ON "User"("isActive", "createdAt");
