import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { createRestaurantNotification } from "@/lib/restaurant-notifications";
import { isDemoSlug } from "@/lib/demo-restaurants";
import { hasFeature } from "@/lib/subscription-plans";

const schema = z.object({
  slug: z.string().min(1).max(60),
  type: z.enum(["MENU_VIEW", "QR_SCAN"]),
});

export async function POST(request: Request) {
  const ip = requestIp(request);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_ANALYTICS_EVENT", 400);
  if (isDemoSlug(parsed.data.slug)) return new Response(null, { status: 204 });
  const limited = rateLimit(`analytics:${ip}`, 60, 60_000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const duplicate = rateLimit(
    `analytics-dedupe:${ip}:${parsed.data.slug}:${parsed.data.type}`,
    1,
    60_000,
  );
  if (!duplicate.allowed) return new Response(null, { status: 204 });
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: parsed.data.slug, isActive: true },
      select: { id: true },
    });
    if (!restaurant) return apiError("RESTAURANT_NOT_FOUND", 404);
    if (!(await hasFeature(restaurant.id, "ANALYTICS_BASIC")))
      return new Response(null, { status: 204 });
    await prisma.analyticsEvent.create({
      data: { restaurantId: restaurant.id, type: parsed.data.type },
    });
    if (parsed.data.type === "QR_SCAN")
      await createRestaurantNotification(prisma, {
        restaurantId: restaurant.id,
        type: "FIRST_QR_SCAN",
        title: "QR scanned for the first time today",
        href: "/dashboard/analytics",
        dedupeKey: `first-qr:${new Date().toISOString().slice(0, 10)}`,
      });
    return new Response(null, { status: 204 });
  } catch (error) {
    logApiError("analytics", error, { ip });
    return apiError("INTERNAL_ERROR", 500);
  }
}
