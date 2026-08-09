import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createLemonCheckout } from "@/lib/lemon-squeezy";

export const CHECKOUT_INTENT_TTL_MS = 20 * 60 * 1000;

export async function startPaidCheckout(input: {
  restaurantId: string;
  userId: string;
  planId: string;
  variantId: string;
  email?: string | null;
  name?: string | null;
}) {
  const publicIntentId = randomBytes(32).toString("hex");
  const intent = await prisma.billingCheckoutIntent.create({
    data: {
      publicIntentId,
      restaurantId: input.restaurantId,
      initiatingUserId: input.userId,
      planId: input.planId,
      variantId: input.variantId,
      expiresAt: new Date(Date.now() + CHECKOUT_INTENT_TTL_MS),
    },
    select: { id: true, publicIntentId: true },
  });

  try {
    return await createLemonCheckout({
      variantId: input.variantId,
      checkoutIntentId: intent.publicIntentId,
      email: input.email,
      name: input.name,
    });
  } catch (error) {
    await prisma.billingCheckoutIntent.updateMany({
      where: { id: intent.id, status: "PENDING", consumedAt: null },
      data: { status: "FAILED" },
    });
    throw error;
  }
}
