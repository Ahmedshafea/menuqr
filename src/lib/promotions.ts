import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AppliedPromotion,
  PromotionCandidate,
} from "@/lib/promotion-engine";
import { hasFeature } from "@/lib/subscription-plans";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export function promotionCustomerKey(phone: string) {
  return phone.replace(/\D/g, "").slice(-15);
}

export async function getPromotionCandidates(input: {
  restaurantId: string;
  customerUserId?: string | null;
  customerKey?: string | null;
  client?: DatabaseClient;
}) {
  const client = input.client || prisma;
  if (!(await hasFeature(input.restaurantId, "PROMOTIONS", client))) return [];
  const customerFilter = input.customerUserId
    ? { customerUserId: input.customerUserId }
    : input.customerKey
      ? { customerKey: input.customerKey }
      : null;
  const [promotions, customerPromotionUsage, customerCouponUsage] =
    await Promise.all([
      client.promotion.findMany({
        where: {
          restaurantId: input.restaurantId,
          isActive: true,
          status: "ACTIVE",
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          nameAr: true,
          type: true,
          targetType: true,
          value: true,
          buyQuantity: true,
          getQuantity: true,
          freeProductId: true,
          minimumOrderValue: true,
          maximumDiscount: true,
          minimumQuantity: true,
          startsAt: true,
          endsAt: true,
          startTime: true,
          endTime: true,
          weekdays: true,
          firstOrderOnly: true,
          newCustomersOnly: true,
          returningOnly: true,
          totalUsageLimit: true,
          perCustomerLimit: true,
          usageCount: true,
          requiresCoupon: true,
          autoApply: true,
          allowStacking: true,
          stackingRule: true,
          priority: true,
          exclusive: true,
          isActive: true,
          status: true,
          products: { select: { productId: true } },
          categories: { select: { categoryId: true } },
          branches: { select: { branchId: true } },
          coupons: {
            select: {
              id: true,
              code: true,
              isActive: true,
              expiresAt: true,
              maximumUsage: true,
              usageCount: true,
              perCustomerLimit: true,
            },
          },
        },
      }),
      customerFilter
        ? client.promotionUsage.groupBy({
            by: ["promotionId"],
            where: { restaurantId: input.restaurantId, ...customerFilter },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      customerFilter
        ? client.promotionUsage.groupBy({
            by: ["couponId"],
            where: {
              restaurantId: input.restaurantId,
              couponId: { not: null },
              ...customerFilter,
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
  const promotionCounts = new Map(
    customerPromotionUsage.map((item) => [
      item.promotionId,
      item._count._all,
    ]),
  );
  const couponCounts = new Map(
    customerCouponUsage
      .filter(
        (item): item is typeof item & { couponId: string } =>
          item.couponId !== null,
      )
      .map((item) => [item.couponId, item._count._all]),
  );

  return promotions.map(
    (promotion): PromotionCandidate => ({
      ...promotion,
      value: Number(promotion.value),
      minimumOrderValue:
        promotion.minimumOrderValue == null
          ? null
          : Number(promotion.minimumOrderValue),
      maximumDiscount:
        promotion.maximumDiscount == null
          ? null
          : Number(promotion.maximumDiscount),
      customerUsageCount: promotionCounts.get(promotion.id) || 0,
      productIds: promotion.products.map((item) => item.productId),
      categoryIds: promotion.categories.map((item) => item.categoryId),
      branchIds: promotion.branches.map((item) => item.branchId),
      coupons: promotion.coupons.map((coupon) => ({
        ...coupon,
        customerUsageCount: couponCounts.get(coupon.id) || 0,
      })),
    }),
  );
}

export async function recordPromotionUsage(
  transaction: Prisma.TransactionClient,
  input: {
    restaurantId: string;
    orderId: string;
    customerUserId?: string | null;
    customerKey?: string | null;
    couponCode?: string | null;
    appliedPromotions: AppliedPromotion[];
  },
) {
  for (const applied of input.appliedPromotions) {
    const promotion = await transaction.promotion.findFirst({
      where: {
        id: applied.id,
        restaurantId: input.restaurantId,
        isActive: true,
        status: "ACTIVE",
      },
      select: {
        id: true,
        usageCount: true,
        totalUsageLimit: true,
        perCustomerLimit: true,
      },
    });
    if (
      !promotion ||
      (promotion.totalUsageLimit != null &&
        promotion.usageCount >= promotion.totalUsageLimit)
    )
      throw new Error("PROMOTION_USAGE_CONFLICT");

    if (promotion.perCustomerLimit != null) {
      const customerUsage = await transaction.promotionUsage.count({
        where: {
          promotionId: promotion.id,
          ...(input.customerUserId
            ? { customerUserId: input.customerUserId }
            : { customerKey: input.customerKey || "" }),
        },
      });
      if (customerUsage >= promotion.perCustomerLimit)
        throw new Error("PROMOTION_USAGE_CONFLICT");
    }

    const couponId = applied.couponId;
    if (couponId) {
      const coupon = await transaction.coupon.findFirst({
        where: {
          id: couponId,
          restaurantId: input.restaurantId,
          isActive: true,
        },
        select: {
          id: true,
          usageCount: true,
          maximumUsage: true,
          perCustomerLimit: true,
        },
      });
      if (
        !coupon ||
        (coupon.maximumUsage != null &&
          coupon.usageCount >= coupon.maximumUsage)
      )
        throw new Error("COUPON_USAGE_CONFLICT");
      if (coupon.perCustomerLimit != null) {
        const couponUsage = await transaction.promotionUsage.count({
          where: {
            couponId,
            ...(input.customerUserId
              ? { customerUserId: input.customerUserId }
              : { customerKey: input.customerKey || "" }),
          },
        });
        if (couponUsage >= coupon.perCustomerLimit)
          throw new Error("COUPON_USAGE_CONFLICT");
      }
      const claimedCoupon = await transaction.coupon.updateMany({
        where: {
          id: couponId,
          isActive: true,
          ...(coupon.maximumUsage == null
            ? {}
            : { usageCount: { lt: coupon.maximumUsage } }),
        },
        data: { usageCount: { increment: 1 } },
      });
      if (claimedCoupon.count !== 1) throw new Error("COUPON_USAGE_CONFLICT");
    }

    const claimedPromotion = await transaction.promotion.updateMany({
      where: {
        id: promotion.id,
        isActive: true,
        status: "ACTIVE",
        ...(promotion.totalUsageLimit == null
          ? {}
          : { usageCount: { lt: promotion.totalUsageLimit } }),
      },
      data: { usageCount: { increment: 1 } },
    });
    if (claimedPromotion.count !== 1)
      throw new Error("PROMOTION_USAGE_CONFLICT");
    await transaction.promotionUsage.create({
      data: {
        restaurantId: input.restaurantId,
        promotionId: promotion.id,
        couponId,
        orderId: input.orderId,
        customerUserId: input.customerUserId,
        customerKey: input.customerKey,
        discountAmount: applied.discountAmount,
      },
    });
    await transaction.promotionOrder.create({
      data: {
        orderId: input.orderId,
        promotionId: promotion.id,
        couponId,
        promotionName: applied.name,
        promotionType: applied.type,
        discountAmount: applied.discountAmount,
        snapshot: applied.snapshot as Prisma.InputJsonValue,
      },
    });
  }
}
