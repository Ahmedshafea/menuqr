ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "WhatsAppOtp" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppOtp_phone_key" ON "WhatsAppOtp"("phone");
CREATE INDEX IF NOT EXISTS "WhatsAppOtp_expiresAt_idx" ON "WhatsAppOtp"("expiresAt");

CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "metaMessageId" TEXT NOT NULL,
  "notificationType" TEXT,
  "templateName" TEXT,
  "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
  "status" TEXT NOT NULL DEFAULT 'accepted',
  "errorCode" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_metaMessageId_key" ON "WhatsAppMessage"("metaMessageId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_status_createdAt_idx" ON "WhatsAppMessage"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_notificationType_createdAt_idx" ON "WhatsAppMessage"("notificationType", "createdAt");
