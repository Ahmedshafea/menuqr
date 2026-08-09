import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { publicOrderUrl } from "@/lib/utils";
import { sendOrderStatusNotification, WhatsAppError } from "@/lib/whatsapp";

export const runtime = "nodejs";

const schema = z.object({
  orderId: z.string().cuid(),
  status: z.enum(["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]),
}).strict();

export async function POST(request: Request) {
  const session = await auth();
  const restaurantId = session?.user.restaurantId;
  if (!restaurantId || !session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    return apiError("UNAUTHORIZED", 401);
  const limited = await rateLimit(`whatsapp-notifications:${restaurantId}`, 60, 10 * 60_000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_NOTIFICATION", 400);
  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, restaurantId, status: parsed.data.status },
    select: { id: true, orderNumber: true, customerPhone: true, accessToken: true, status: true, restaurant: { select: { name: true, nameAr: true, locale: true } } },
  });
  if (!order) return apiError("ORDER_NOT_FOUND", 404);
  try {
    const result = await sendOrderStatusNotification({
      orderId: order.id,
      status: order.status,
      orderNumber: order.orderNumber,
      customerPhone: order.customerPhone,
      restaurantName: order.restaurant.locale === "ar" && order.restaurant.nameAr ? order.restaurant.nameAr : order.restaurant.name,
      customerOrderUrl: publicOrderUrl(order.accessToken),
      language: order.restaurant.locale === "ar" ? "ar" : "en",
    });
    return Response.json(result);
  } catch (error) {
    logApiError("whatsapp-notification", error, { orderId: order.id, restaurantId });
    if (error instanceof WhatsAppError) return apiError(error.code, error.status, error.retryAfter ? { retryAfter: error.retryAfter } : undefined);
    return apiError("WHATSAPP_SEND_FAILED", 500);
  }
}
