import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { apiError } from "@/lib/api";
import { promotionInputSchema } from "@/lib/promotion-validation";
import { revalidatePath, revalidateTag } from "next/cache";
import { hasFeature } from "@/lib/subscription-plans";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ restaurantId }, { id }] = await Promise.all([requireTenant(), params]);
  if (!(await hasFeature(restaurantId, "PROMOTIONS")))
    return apiError("FEATURE_NOT_AVAILABLE", 403);
  const promotion = await prisma.promotion.findFirst({
    where: { id, restaurantId },
    include: {
      products: { select: { productId: true } },
      categories: { select: { categoryId: true } },
      branches: { select: { branchId: true } },
      coupons: { orderBy: { createdAt: "asc" } },
    },
  });
  return promotion
    ? Response.json(promotion)
    : apiError("PROMOTION_NOT_FOUND", 404);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ restaurantId }, { id }] = await Promise.all([requireTenant(), params]);
  if (!(await hasFeature(restaurantId, "PROMOTIONS")))
    return apiError("FEATURE_NOT_AVAILABLE", 403);
  const parsed = promotionInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return apiError("INVALID_PROMOTION", 400, parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const existing = await prisma.promotion.findFirst({
    where: { id, restaurantId },
    select: { id: true },
  });
  if (!existing) return apiError("PROMOTION_NOT_FOUND", 404);
  const [products, categories, branches, freeProduct] = await Promise.all([
    prisma.product.findMany({ where: { restaurantId, id: { in: input.productIds } }, select: { id: true } }),
    prisma.category.findMany({ where: { restaurantId, id: { in: input.categoryIds } }, select: { id: true } }),
    prisma.branch.findMany({ where: { restaurantId, id: { in: input.branchIds } }, select: { id: true } }),
    input.freeProductId
      ? prisma.product.findFirst({
          where: { restaurantId, id: input.freeProductId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (
    products.length !== new Set(input.productIds).size ||
    categories.length !== new Set(input.categoryIds).size ||
    branches.length !== new Set(input.branchIds).size ||
    (input.freeProductId && !freeProduct)
  )
    return apiError("INVALID_PROMOTION_TARGET", 400);
  try {
    await prisma.$transaction(async (transaction) => {
      const retainedCouponIds = input.coupons
        .map((coupon) => coupon.id)
        .filter((couponId): couponId is string => Boolean(couponId));
      await Promise.all([
        transaction.promotionProduct.deleteMany({ where: { promotionId: id } }),
        transaction.promotionCategory.deleteMany({ where: { promotionId: id } }),
        transaction.promotionBranch.deleteMany({ where: { promotionId: id } }),
        transaction.coupon.deleteMany({
          where: {
            promotionId: id,
            id: { notIn: retainedCouponIds },
            usages: { none: {} },
          },
        }),
        transaction.coupon.updateMany({
          where: {
            promotionId: id,
            id: { notIn: retainedCouponIds },
            usages: { some: {} },
          },
          data: { isActive: false },
        }),
      ]);
      await transaction.promotion.update({
        where: { id },
        data: {
          name: input.name,
          nameAr: input.nameAr || null,
          description: input.description || null,
          descriptionAr: input.descriptionAr || null,
          type: input.type,
          targetType: input.targetType,
          value: input.value,
          buyQuantity: input.buyQuantity,
          getQuantity: input.getQuantity,
          freeProductId: input.freeProductId || null,
          minimumOrderValue: input.minimumOrderValue,
          maximumDiscount: input.maximumDiscount,
          minimumQuantity: input.minimumQuantity,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          startTime: input.startTime,
          endTime: input.endTime,
          weekdays: [...new Set(input.weekdays)],
          firstOrderOnly: input.firstOrderOnly,
          newCustomersOnly: input.newCustomersOnly,
          returningOnly: input.returningOnly,
          totalUsageLimit: input.totalUsageLimit,
          perCustomerLimit: input.perCustomerLimit,
          requiresCoupon: input.requiresCoupon,
          autoApply: input.autoApply,
          allowStacking: input.allowStacking,
          stackingRule: input.stackingRule,
          priority: input.priority,
          exclusive: input.exclusive,
          isActive: input.status === "ACTIVE",
          status: input.status,
          archivedAt: input.status === "ARCHIVED" ? new Date() : null,
          products: { create: products.map(({ id: productId }) => ({ productId })) },
          categories: { create: categories.map(({ id: categoryId }) => ({ categoryId })) },
          branches: { create: branches.map(({ id: branchId }) => ({ branchId })) },
          coupons: {
            upsert: input.coupons.map((coupon) => ({
              where: { id: coupon.id || "__new__" },
              update: {
                code: coupon.code,
                description: coupon.description,
                maximumUsage: coupon.maximumUsage,
                perCustomerLimit: coupon.perCustomerLimit,
                expiresAt: coupon.expiresAt,
                isActive: coupon.isActive,
              },
              create: {
                restaurantId,
                code: coupon.code,
                description: coupon.description,
                maximumUsage: coupon.maximumUsage,
                perCustomerLimit: coupon.perCustomerLimit,
                expiresAt: coupon.expiresAt,
                isActive: coupon.isActive,
              },
            })),
          },
        },
      });
    });
    revalidateTag("public-menu");
    revalidatePath("/menu", "layout");
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return apiError("COUPON_ALREADY_EXISTS", 409);
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ restaurantId }, { id }] = await Promise.all([requireTenant(), params]);
  if (!(await hasFeature(restaurantId, "PROMOTIONS")))
    return apiError("FEATURE_NOT_AVAILABLE", 403);
  const promotion = await prisma.promotion.findFirst({
    where: { id, restaurantId },
    select: { id: true, _count: { select: { usages: true } } },
  });
  if (!promotion) return apiError("PROMOTION_NOT_FOUND", 404);
  if (promotion._count.usages)
    await prisma.promotion.update({
      where: { id },
      data: { status: "ARCHIVED", isActive: false, archivedAt: new Date() },
    });
  else await prisma.promotion.delete({ where: { id } });
  revalidateTag("public-menu");
  revalidatePath("/menu", "layout");
  return Response.json({ ok: true });
}
