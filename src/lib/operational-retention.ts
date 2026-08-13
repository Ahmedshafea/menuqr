import "server-only";
import { prisma } from "@/lib/prisma";

export const OPERATIONAL_RETENTION = {
  rateLimitGraceMs: 60 * 60_000,
  otpSafetyWindowMs: 24 * 60 * 60_000,
  batchSize: 500,
} as const;

export async function cleanupOperationalRecords(batchSize: number = OPERATIONAL_RETENTION.batchSize) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > OPERATIONAL_RETENTION.batchSize)
    throw new RangeError(`batchSize must be an integer between 1 and ${OPERATIONAL_RETENTION.batchSize}`);
  return prisma.$transaction(async (tx) => {
    const rate = await tx.$executeRaw`
      DELETE FROM "RateLimitBucket" WHERE "key" IN (
        SELECT "key" FROM "RateLimitBucket" WHERE "resetAt" < NOW() - INTERVAL '1 hour'
        ORDER BY "resetAt" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
      )
    `;
    const otp = await tx.$executeRaw`
      DELETE FROM "WhatsAppOtp" WHERE "id" IN (
        SELECT "id" FROM "WhatsAppOtp"
        WHERE "updatedAt" < NOW() - INTERVAL '24 hours' AND ("expiresAt" < NOW() OR "verifiedAt" IS NOT NULL OR "attempts" >= 5)
        ORDER BY "updatedAt" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
      )
    `;
    const leases = await tx.$executeRaw`
      WITH selected AS MATERIALIZED (
        SELECT "key" FROM "ImportOperationLease" WHERE "expiresAt" < NOW()
        ORDER BY "expiresAt", "key" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "ImportOperationLease" AS lease
      USING selected
      WHERE lease."key" = selected."key"
    `;
    return { rateLimitBuckets: rate, whatsAppOtps: otp, importLeases: leases };
  });
}
