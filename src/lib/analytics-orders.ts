import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getOrderAnalyticsSummary(
  restaurantId: string,
  since: Date,
  client: PrismaClient = prisma,
) {
  const [byStatus, byFulfillment, daily, delivery] = await Promise.all([
    client.order.groupBy({
      by: ["status"],
      where: { restaurantId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    client.order.groupBy({
      by: ["fulfillmentType"],
      where: { restaurantId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    client.$queryRaw<Array<{ day: Date; count: number }>>`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS count
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY DATE_TRUNC('day', "createdAt")
    `,
    client.$queryRaw<Array<{ averageMinutes: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("deliveredAt" - "outForDeliveryAt")) / 60)::float8 AS "averageMinutes"
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= (${since}::timestamptz AT TIME ZONE 'UTC')
        AND "outForDeliveryAt" IS NOT NULL
        AND "deliveredAt" IS NOT NULL
    `,
  ]);
  return {
    byStatus,
    byFulfillment,
    daily,
    averageDeliveryMinutes: delivery[0]?.averageMinutes ?? null,
  };
}
