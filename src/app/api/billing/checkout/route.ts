import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/tenant";
import { startPaidCheckout } from "@/lib/billing-checkout";
import { apiError, logApiError } from "@/lib/api";

const inputSchema = z.object({ planCode: z.string().trim().min(1).max(50) });

export async function POST(request: Request) {
  const { restaurantId, session } = await requireOwner();
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_PLAN", 400);
  const plan = await prisma.plan.findFirst({ where: { code: parsed.data.planCode, isActive: true }, select: { id: true, price: true, lemonSqueezyVariantId: true } });
  if (!plan || Number(plan.price) <= 0 || !plan.lemonSqueezyVariantId) return apiError("PAID_PLAN_NOT_CONFIGURED", 409);
  try {
    const url = await startPaidCheckout({ variantId: plan.lemonSqueezyVariantId, restaurantId, planId: plan.id, userId: session.user.id, email: session.user.email, name: session.user.name });
    return Response.json({ url });
  } catch (error) {
    logApiError("billing-checkout", error, { restaurantId, planId: plan.id });
    return apiError("CHECKOUT_UNAVAILABLE", 503);
  }
}
