import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { apiError } from "@/lib/api";
import { hasFeature } from "@/lib/subscription-plans";

export async function GET(request: Request) {
  const { restaurantId } = await requireTenant();
  if (!(await hasFeature(restaurantId, "PROMOTIONS")))
    return apiError("FEATURE_NOT_AVAILABLE", 403);
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const [summary, top, couponUsage, totalOrders] = await Promise.all([
    prisma.promotionOrder.aggregate({
      where: { order: { restaurantId }, createdAt: { gte: since } },
      _sum: { discountAmount: true },
      _count: { _all: true },
    }),
    prisma.promotionOrder.groupBy({
      by: ["promotionId", "promotionName"],
      where: { order: { restaurantId }, createdAt: { gte: since } },
      _sum: { discountAmount: true },
      _count: { _all: true },
      orderBy: { _count: { promotionId: "desc" } },
      take: 10,
    }),
    prisma.promotionUsage.count({
      where: {
        restaurantId,
        couponId: { not: null },
        createdAt: { gte: since },
      },
    }),
    prisma.order.count({ where: { restaurantId, createdAt: { gte: since } } }),
  ]);
  const affected = summary._count._all;
  return Response.json({
    ordersAffected: affected,
    discountCost: Number(summary._sum.discountAmount || 0),
    couponUsage,
    conversionRate: totalOrders ? (affected / totalOrders) * 100 : 0,
    top: top.map((item) => ({
      ...item,
      discountAmount: Number(item._sum.discountAmount || 0),
      orders: item._count._all,
    })),
  });
}
