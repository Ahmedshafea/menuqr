import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { apiError } from "@/lib/api";
import { promotionInputSchema } from "@/lib/promotion-validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { restaurantId } = await requireTenant();
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const take = Math.min(50, Math.max(10, Number(url.searchParams.get("take")) || 20));
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const status = url.searchParams.get("status");
  const where: Prisma.PromotionWhereInput = {
    restaurantId,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { nameAr: { contains: query, mode: "insensitive" } },
            { coupons: { some: { code: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].includes(status || "")
      ? { status: status as "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" }
      : {}),
  };
  const [items, total, totals] = await Promise.all([
    prisma.promotion.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        name: true,
        nameAr: true,
        type: true,
        status: true,
        isActive: true,
        startsAt: true,
        endsAt: true,
        usageCount: true,
        totalUsageLimit: true,
        value: true,
        priority: true,
        requiresCoupon: true,
        coupons: {
          select: {
            id: true,
            code: true,
            usageCount: true,
            maximumUsage: true,
            isActive: true,
          },
        },
        _count: { select: { orders: true } },
      },
    }),
    prisma.promotion.count({ where }),
    prisma.promotion.groupBy({
      by: ["status"],
      where: { restaurantId },
      _count: { _all: true },
    }),
  ]);
  return Response.json({ items, total, page, pages: Math.max(1, Math.ceil(total / take)), totals });
}

export async function POST(request: Request) {
  const { restaurantId } = await requireTenant();
  const parsed = promotionInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return apiError("INVALID_PROMOTION", 400, parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const [products, categories, branches] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId, id: { in: input.productIds } },
      select: { id: true },
    }),
    prisma.category.findMany({
      where: { restaurantId, id: { in: input.categoryIds } },
      select: { id: true },
    }),
    prisma.branch.findMany({
      where: { restaurantId, id: { in: input.branchIds } },
      select: { id: true },
    }),
  ]);
  if (
    products.length !== new Set(input.productIds).size ||
    categories.length !== new Set(input.categoryIds).size ||
    branches.length !== new Set(input.branchIds).size ||
    (input.freeProductId &&
      !products.some((product) => product.id === input.freeProductId) &&
      !(await prisma.product.findFirst({
        where: { id: input.freeProductId, restaurantId },
        select: { id: true },
      })))
  )
    return apiError("INVALID_PROMOTION_TARGET", 400);
  try {
    const promotion = await prisma.promotion.create({
      data: {
        restaurantId,
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
        isActive: input.isActive,
        status: input.status,
        products: { create: products.map(({ id }) => ({ productId: id })) },
        categories: { create: categories.map(({ id }) => ({ categoryId: id })) },
        branches: { create: branches.map(({ id }) => ({ branchId: id })) },
        coupons: {
          create: input.coupons.map((coupon) => ({
            restaurantId,
            code: coupon.code,
            description: coupon.description,
            maximumUsage: coupon.maximumUsage,
            perCustomerLimit: coupon.perCustomerLimit,
            expiresAt: coupon.expiresAt,
            isActive: coupon.isActive,
          })),
        },
      },
      select: { id: true },
    });
    return Response.json(promotion, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return apiError("COUPON_ALREADY_EXISTS", 409);
    throw error;
  }
}
