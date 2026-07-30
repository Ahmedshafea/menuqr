import { auth } from "@/auth";
import { apiError, rateLimitError } from "@/lib/api";
import { calculateOrderPricing } from "@/lib/order-pricing";
import { calculatePromotions } from "@/lib/promotion-engine";
import { promotionCalculateSchema } from "@/lib/promotion-validation";
import {
  getPromotionCandidates,
  promotionCustomerKey,
} from "@/lib/promotions";
import { prisma } from "@/lib/prisma";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(
    `promotion-calculate:${requestIp(request)}`,
    30,
    60_000,
  );
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = promotionCalculateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return apiError("INVALID_PROMOTION_REQUEST", 400, parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const [session, restaurant] = await Promise.all([
    auth(),
    prisma.restaurant.findFirst({
      where: { slug: input.restaurantSlug, isActive: true },
      select: {
        id: true,
        settings: {
          select: {
            deliveryFee: true,
            deliveryFeeType: true,
            serviceFee: true,
            serviceFeeType: true,
            taxRate: true,
            taxType: true,
          },
        },
        products: {
          where: { id: { in: input.items.map((item) => item.productId) } },
          select: { id: true, categoryId: true, price: true },
        },
      },
    }),
  ]);
  if (!restaurant) return apiError("RESTAURANT_UNAVAILABLE", 404);
  const productMap = new Map(restaurant.products.map((product) => [product.id, product]));
  if (input.items.some((item) => !productMap.has(item.productId)))
    return apiError("PRODUCT_UNAVAILABLE", 409);
  const lines = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    return {
      productId: product.id,
      categoryId: product.categoryId,
      unitPrice: Number(product.price) + item.extraTotal,
      quantity: item.quantity,
    };
  });
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const customerKey = input.customerPhone
    ? promotionCustomerKey(input.customerPhone)
    : null;
  const [candidates, customerOrderCount] = await Promise.all([
    getPromotionCandidates({
      restaurantId: restaurant.id,
      customerUserId: session?.user.id,
      customerKey,
    }),
    prisma.order.count({
      where: session?.user.id
        ? { restaurantId: restaurant.id, customerUserId: session.user.id }
        : customerKey
          ? {
              restaurantId: restaurant.id,
              customerPhone: { endsWith: customerKey },
            }
          : { id: "__none__" },
    }),
  ]);
  const promotions = calculatePromotions(candidates, {
    subtotal,
    lines,
    fulfillmentType: input.fulfillmentType,
    branchId: input.branchId,
    customerOrderCount,
    couponCode: input.couponCode,
  });
  const settings = restaurant.settings
    ? {
        ...restaurant.settings,
        deliveryFee: Number(restaurant.settings.deliveryFee),
        serviceFee: Number(restaurant.settings.serviceFee),
        taxRate: Number(restaurant.settings.taxRate),
      }
    : {};
  const pricing = calculateOrderPricing(
    subtotal,
    input.fulfillmentType,
    settings,
    promotions,
  );
  return Response.json({
    pricing,
    appliedPromotions: promotions.appliedPromotions.map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      nameAr: promotion.nameAr,
      type: promotion.type,
      discountAmount: promotion.discountAmount,
      freeDelivery: promotion.freeDelivery,
    })),
    couponCode: promotions.couponCode,
    couponError: promotions.couponError,
  });
}
