import type { Prisma } from "@prisma/client";
import { featureLimit, type FeatureKey } from "@/lib/subscription-plans";

export async function assertTenantQuota(tx: Prisma.TransactionClient, restaurantId: string, key: FeatureKey, currentCount: () => Promise<number>, adding = 1) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${restaurantId}:${key}`}))`;
  const [limit, count] = await Promise.all([featureLimit(restaurantId, key, tx), currentCount()]);
  if (limit !== null && limit >= 0 && count + adding > limit) throw new Error("PLAN_LIMIT_REACHED");
}
