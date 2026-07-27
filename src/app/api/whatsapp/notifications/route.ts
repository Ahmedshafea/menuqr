import { z } from "zod";
import { auth } from "@/auth";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import {
  sendCustomerNotification, sendRestaurantNotification, WhatsAppError,
  WHATSAPP_NOTIFICATION_TYPES,
} from "@/lib/whatsapp";
import type { CustomerNotificationType, RestaurantNotificationType } from "@/types/whatsapp";

export const runtime = "nodejs";

const customerTypes = new Set<CustomerNotificationType>([
  "order_received", "order_accepted", "order_preparing", "order_ready", "order_out_for_delivery",
  "order_delivered", "order_cancelled", "payment_successful", "payment_failed",
]);
const schema = z.object({
  type: z.enum(WHATSAPP_NOTIFICATION_TYPES),
  phone: z.string().min(8).max(30),
  variables: z.array(z.union([z.string().max(1024), z.number().finite()])).max(20).default([]),
  language: z.enum(["ar", "en"]).default("ar"),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.restaurantId || !session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    return apiError("UNAUTHORIZED", 401);
  const limited = rateLimit(`whatsapp-notifications:${session.user.restaurantId}`, 60, 10 * 60_000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_NOTIFICATION", 400, parsed.error.flatten());
  try {
    const result = customerTypes.has(parsed.data.type as CustomerNotificationType)
      ? await sendCustomerNotification(parsed.data.type as CustomerNotificationType, parsed.data.phone, parsed.data.variables, parsed.data.language)
      : await sendRestaurantNotification(parsed.data.type as RestaurantNotificationType, parsed.data.phone, parsed.data.variables, parsed.data.language);
    return Response.json(result);
  } catch (error) {
    logApiError("whatsapp-notification", error, { type: parsed.data.type, restaurantId: session.user.restaurantId });
    if (error instanceof WhatsAppError) return apiError(error.code, error.status, error.retryAfter ? { retryAfter: error.retryAfter } : undefined);
    return apiError("WHATSAPP_SEND_FAILED", 500);
  }
}

