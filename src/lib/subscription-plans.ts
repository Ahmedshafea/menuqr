import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const FEATURE_KEYS = [
  "PRODUCT_LIMIT",
  "BRANCH_LIMIT",
  "TEAM_MEMBER_LIMIT",
  "QR_MENU",
  "WHATSAPP_ORDERS",
  "ANALYTICS_BASIC",
  "ANALYTICS_ADVANCED",
  "PROMOTIONS",
  "PDF_IMPORT",
  "REVIEWS",
  "CUSTOM_DOMAIN",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const activeSubscriptionWhere = (now: Date): Prisma.SubscriptionWhereInput => ({
  status: { in: ["ACTIVE", "TRIALING"] },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

export async function getPlanCatalog(client: DatabaseClient = prisma) {
  const now = new Date();
  const [plans, launchPromotion] = await Promise.all([
    client.plan.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: {
        features: {
          where: { enabled: true, feature: { isPublic: true } },
          orderBy: { feature: { displayOrder: "asc" } },
          include: { feature: true },
        },
      },
    }),
    client.launchPromotion.findFirst({
      where: { enabled: true, startsAt: { lte: now }, endsAt: { gte: now } },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        trialDays: true,
        affectedPlanId: true,
      },
      orderBy: { startsAt: "desc" },
    }),
  ]);
  return { plans, launchPromotion };
}

export async function getRestaurantSubscription(
  restaurantId: string,
  client: DatabaseClient = prisma,
) {
  const now = new Date();
  return client.subscription.findFirst({
    where: { restaurantId, ...activeSubscriptionWhere(now) },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    include: {
      plan: {
        include: {
          features: { where: { enabled: true }, include: { feature: true } },
        },
      },
      launchPromotion: { select: { id: true, name: true, endsAt: true } },
    },
  });
}

export async function ensureRestaurantSubscription(
  restaurantId: string,
  client: DatabaseClient = prisma,
) {
  const existing = await getRestaurantSubscription(restaurantId, client);
  if (existing) return existing;
  const freePlan = await client.plan.findUnique({
    where: { code: "FREE" },
    select: { id: true },
  });
  if (!freePlan) throw new Error("FREE_PLAN_NOT_CONFIGURED");
  await client.subscription.create({
    data: { restaurantId, planId: freePlan.id, status: "ACTIVE" },
  });
  return getRestaurantSubscription(restaurantId, client);
}

export async function getRestaurantEntitlements(
  restaurantId: string,
  client: DatabaseClient = prisma,
) {
  const subscription = await ensureRestaurantSubscription(restaurantId, client);
  const featureMap = new Map<FeatureKey, { enabled: boolean; value: number | null }>();
  for (const mapping of subscription?.plan.features ?? []) {
    if (FEATURE_KEYS.includes(mapping.feature.key as FeatureKey))
      featureMap.set(mapping.feature.key as FeatureKey, {
        enabled: mapping.enabled,
        value: mapping.value,
      });
  }
  return { subscription, featureMap };
}

export async function hasFeature(
  restaurantId: string,
  key: FeatureKey,
  client: DatabaseClient = prisma,
) {
  const { featureMap } = await getRestaurantEntitlements(restaurantId, client);
  return featureMap.get(key)?.enabled === true;
}

export async function featureLimit(
  restaurantId: string,
  key: FeatureKey,
  client: DatabaseClient = prisma,
) {
  const { featureMap } = await getRestaurantEntitlements(restaurantId, client);
  const feature = featureMap.get(key);
  return feature?.enabled ? (feature.value ?? null) : 0;
}

export async function createInitialSubscription(
  client: Prisma.TransactionClient,
  restaurantId: string,
) {
  const now = new Date();
  const launch = await client.launchPromotion.findFirst({
    where: { enabled: true, startsAt: { lte: now }, endsAt: { gte: now } },
    select: { id: true, affectedPlanId: true, trialDays: true },
    orderBy: { startsAt: "desc" },
  });
  if (launch) {
    const trialEndsAt = new Date(now);
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + launch.trialDays);
    return client.subscription.create({
      data: {
        restaurantId,
        planId: launch.affectedPlanId,
        status: "TRIALING",
        startsAt: now,
        endsAt: trialEndsAt,
        trialEndsAt,
        launchPromotionId: launch.id,
      },
    });
  }
  const freePlan = await client.plan.findUnique({
    where: { code: "FREE" },
    select: { id: true },
  });
  if (!freePlan) throw new Error("FREE_PLAN_NOT_CONFIGURED");
  return client.subscription.create({
    data: {
      restaurantId,
      planId: freePlan.id,
      status: "ACTIVE",
      startsAt: now,
    },
  });
}
