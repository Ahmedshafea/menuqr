import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { apiError } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ restaurantId }, { id }] = await Promise.all([requireTenant(), params]);
  const source = await prisma.promotion.findFirst({
    where: { id, restaurantId },
    include: {
      products: { select: { productId: true } },
      categories: { select: { categoryId: true } },
      branches: { select: { branchId: true } },
    },
  });
  if (!source) return apiError("PROMOTION_NOT_FOUND", 404);
  const copy = await prisma.promotion.create({
    data: {
      restaurantId,
      name: `${source.name} Copy`,
      nameAr: source.nameAr ? `${source.nameAr} - نسخة` : null,
      description: source.description,
      descriptionAr: source.descriptionAr,
      type: source.type,
      targetType: source.targetType,
      value: source.value,
      buyQuantity: source.buyQuantity,
      getQuantity: source.getQuantity,
      freeProductId: source.freeProductId,
      minimumOrderValue: source.minimumOrderValue,
      maximumDiscount: source.maximumDiscount,
      minimumQuantity: source.minimumQuantity,
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      startTime: source.startTime,
      endTime: source.endTime,
      weekdays: source.weekdays,
      firstOrderOnly: source.firstOrderOnly,
      newCustomersOnly: source.newCustomersOnly,
      returningOnly: source.returningOnly,
      totalUsageLimit: source.totalUsageLimit,
      perCustomerLimit: source.perCustomerLimit,
      requiresCoupon: source.requiresCoupon,
      autoApply: source.autoApply,
      allowStacking: source.allowStacking,
      stackingRule: source.stackingRule,
      priority: source.priority,
      exclusive: source.exclusive,
      status: "DRAFT",
      isActive: false,
      products: { create: source.products.map(({ productId }) => ({ productId })) },
      categories: { create: source.categories.map(({ categoryId }) => ({ categoryId })) },
      branches: { create: source.branches.map(({ branchId }) => ({ branchId })) },
    },
    select: { id: true },
  });
  return Response.json(copy, { status: 201 });
}
