import "server-only";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const IMPORT_WINDOW_MS = 15 * 60_000;
const IMPORT_LEASE_MS = 2 * 60_000;

export async function beginImportOperation(userId: string, restaurantId: string, kind: string) {
  const [userLimit, tenantLimit] = await Promise.all([
    rateLimit(`import:user:${userId}`, 6, IMPORT_WINDOW_MS),
    rateLimit(`import:tenant:${restaurantId}`, 12, IMPORT_WINDOW_MS),
  ]);
  if (!userLimit.allowed || !tenantLimit.allowed)
    return { allowed: false as const, reason: "rate" as const, retryAfter: Math.max(userLimit.retryAfter, tenantLimit.retryAfter) };

  const keys = [`import-user:${userId}`, `import-tenant:${restaurantId}`];
  const acquired = await prisma.$transaction(async (tx) => {
    for (const key of keys) {
      const rows = await tx.$queryRaw<Array<{ key: string }>>`
        INSERT INTO "ImportOperationLease" ("key", "userId", "restaurantId", "expiresAt", "updatedAt")
        VALUES (${key}, ${userId}, ${restaurantId}, NOW() + (${IMPORT_LEASE_MS} * INTERVAL '1 millisecond'), NOW())
        ON CONFLICT ("key") DO UPDATE SET
          "userId" = EXCLUDED."userId", "restaurantId" = EXCLUDED."restaurantId",
          "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = NOW()
        WHERE "ImportOperationLease"."expiresAt" <= NOW()
        RETURNING "key"
      `;
      if (!rows.length) throw new Error("IMPORT_BUSY");
    }
    return true;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "IMPORT_BUSY") return false;
    throw error;
  });
  if (!acquired) return { allowed: false as const, reason: "concurrent" as const, retryAfter: Math.ceil(IMPORT_LEASE_MS / 1000) };
  return {
    allowed: true as const,
    kind,
    async release() {
      await prisma.importOperationLease.deleteMany({ where: { key: { in: keys }, userId, restaurantId } });
    },
  };
}
