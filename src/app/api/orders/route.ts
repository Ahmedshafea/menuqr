import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validators";
import { whatsappUrl } from "@/lib/utils";
import { isRestaurantOpen } from "@/lib/restaurant-hours";
import { apiError, rateLimitError } from "@/lib/api";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: Request) {
  const ip = requestIp(request);
  const limited = rateLimit(`orders:${ip}`, 10, 10 * 60 * 1000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = checkoutSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return apiError("INVALID_ORDER", 400, parsed.error.flatten().fieldErrors);
  const data = parsed.data;
  if (!(await verifyTurnstile(request, data.turnstileToken)))
    return apiError("TURNSTILE_FAILED", 400);
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: data.restaurantSlug },
    select: {
      id: true,
      name: true,
      nameAr: true,
      whatsapp: true,
      currency: true,
      locale: true,
      isActive: true,
      settings: { select: { allowOrdering: true } },
      branches: {
        where: { isActive: true },
        select: {
          workingHours: {
            select: {
              dayOfWeek: true,
              opensAt: true,
              closesAt: true,
              isClosed: true,
            },
          },
        },
        take: 1,
      },
      products: {
        where: {
          id: { in: data.items.map((item) => item.productId) },
          isAvailable: true,
        },
        select: {
          id: true,
          name: true,
          nameAr: true,
          price: true,
          stock: true,
          extras: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              price: true,
              isAvailable: true,
            },
          },
        },
      },
    },
  });
  if (!restaurant?.isActive) return apiError("RESTAURANT_UNAVAILABLE", 404);
  const arabic = restaurant.locale === "ar";
  if (
    !(restaurant.settings?.allowOrdering ?? true) ||
    !restaurant.branches[0] ||
    !isRestaurantOpen(restaurant.branches[0].workingHours)
  )
    return apiError("ORDERING_CLOSED", 409);
  const productMap = new Map(
    restaurant.products.map((product) => [product.id, product]),
  );
  if (
    data.items.some((item) => {
      const product = productMap.get(item.productId);
      return (
        !product || (product.stock !== null && product.stock < item.quantity)
      );
    })
  )
    return apiError("PRODUCT_UNAVAILABLE", 409);
  let total = 0;
  const verified = data.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error("Validated product missing");
    const extras = item.extras
      .map((selected) =>
        product.extras.find(
          (extra) => extra.id === selected.id && extra.isAvailable,
        ),
      )
      .filter(Boolean);
    const unit =
      Number(product.price) +
      extras.reduce((sum, extra) => sum + Number(extra!.price), 0);
    total += unit * item.quantity;
    return {
      item,
      product,
      extras,
      unit,
      displayName: arabic && product.nameAr ? product.nameAr : product.name,
    };
  });
  const number = `MQ-${Date.now().toString(36).toUpperCase()}`;
  const accessToken = randomBytes(24).toString("base64url");
  const order = await prisma.$transaction(async (transaction) => {
    const created = await transaction.order.create({
      data: {
        orderNumber: number,
        accessToken,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        deliveryAddress: data.deliveryAddress,
        notes: data.notes,
        subtotal: total,
        total,
        restaurantId: restaurant.id,
        items: {
          create: verified.map((value) => ({
            productName: value.displayName,
            unitPrice: value.unit,
            quantity: value.item.quantity,
            productId: value.product.id,
            extras: {
              create: value.extras.map((extra) => ({
                name: arabic && extra!.nameAr ? extra!.nameAr : extra!.name,
                price: extra!.price,
                extraId: extra!.id,
              })),
            },
          })),
        },
      },
    });
    for (const value of verified)
      if (value.product.stock !== null)
        await transaction.product.update({
          where: { id: value.product.id },
          data: { stock: { decrement: value.item.quantity } },
        });
    return created;
  });
  const restaurantName =
    arabic && restaurant.nameAr ? restaurant.nameAr : restaurant.name;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  const trackingUrl = `${origin}/order/${accessToken}`;
  const message = arabic
    ? `طلب جديد #${number} من ${data.customerName} إلى ${restaurantName}\n\nعرض الطلب والتواصل مع العميل:\n${trackingUrl}`
    : `New order #${number} from ${data.customerName} for ${restaurantName}\n\nView the order and contact the customer:\n${trackingUrl}`;
  return Response.json(
    {
      orderId: order.id,
      orderNumber: number,
      trackingUrl,
      whatsappUrl: whatsappUrl(restaurant.whatsapp, message),
    },
    { status: 201 },
  );
}
