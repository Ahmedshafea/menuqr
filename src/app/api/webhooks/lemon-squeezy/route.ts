import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, logApiError } from "@/lib/api";
import { verifyLemonSignature } from "@/lib/lemon-squeezy";

type Payload = {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: { id?: string; type?: string; attributes?: Record<string, unknown> };
};

const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
]);
const PAYMENT_EVENTS = new Set([
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_recovered",
  "subscription_payment_refunded",
]);
const SUPPORTED_EVENTS = new Set([...SUBSCRIPTION_EVENTS, ...PAYMENT_EVENTS, "order_refunded"]);

const stringValue = (value: unknown) => value == null ? null : String(value);
const dateValue = (value: unknown) => {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};
const internalStatus = (provider: string) => provider === "on_trial" ? "TRIALING" : provider === "active" || provider === "cancelled" ? "ACTIVE" : provider === "past_due" || provider === "paused" ? "PAST_DUE" : "CANCELLED";

// Lemon Squeezy does not currently include a delivery/event ID. This semantic key
// uses stable provider fields and is independent of JSON property order.
function lemonEventIdentity(eventName: string, payload: Payload) {
  const attributes = payload.data?.attributes || {};
  return createHash("sha256").update(JSON.stringify([
    eventName,
    payload.data?.type || null,
    payload.data?.id || null,
    stringValue(attributes.store_id),
    stringValue(attributes.subscription_id),
    stringValue(attributes.order_id),
    stringValue(attributes.variant_id),
    stringValue(attributes.status),
    stringValue(attributes.updated_at),
    stringValue(attributes.created_at),
  ])).digest("hex");
}

class BillingRejection extends Error {
  constructor(public reason: string, public status = 422) { super(reason); }
}

function validateProviderBoundary(attributes: Record<string, unknown>) {
  const configuredStore = process.env.LEMON_SQUEEZY_STORE_ID?.trim();
  if (!configuredStore) throw new BillingRejection("STORE_NOT_CONFIGURED", 503);
  if (stringValue(attributes.store_id) !== configuredStore) throw new BillingRejection("STORE_MISMATCH");
  if (process.env.NODE_ENV === "production" && attributes.test_mode !== false) throw new BillingRejection("TEST_MODE_REJECTED");
}

function rejectionLog(input: { eventName: string; resourceId?: string; attributes: Record<string, unknown>; intentId?: string | null; reason: string }) {
  console.warn(JSON.stringify({
    level: "warn",
    context: "lemon-webhook",
    event: "billing_event_rejected",
    eventName: input.eventName,
    providerSubscriptionId: input.eventName.startsWith("subscription_payment_") ? stringValue(input.attributes.subscription_id) : input.resourceId,
    providerOrderId: stringValue(input.attributes.order_id),
    intentId: input.intentId || undefined,
    reason: input.reason,
    timestamp: new Date().toISOString(),
  }));
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyLemonSignature(raw, request.headers.get("x-signature"))) {
    console.warn(JSON.stringify({ level: "warn", context: "lemon-webhook", event: "signature_rejected", timestamp: new Date().toISOString() }));
    return apiError("INVALID_WEBHOOK_SIGNATURE", 403);
  }

  let payload: Payload;
  try { payload = JSON.parse(raw) as Payload; } catch { return apiError("INVALID_WEBHOOK_PAYLOAD", 400); }
  const eventName = payload.meta?.event_name || "";
  const resourceId = payload.data?.id;
  const attributes = payload.data?.attributes || {};
  const intentId = stringValue(payload.meta?.custom_data?.checkout_intent_id);
  if (!eventName || !resourceId || !payload.data?.type) return apiError("INVALID_WEBHOOK_PAYLOAD", 400);

  try {
    validateProviderBoundary(attributes);
    const providerEventId = lemonEventIdentity(eventName, payload);
    const occurredAt = dateValue(attributes.updated_at) || dateValue(attributes.created_at);

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.billingEvent.create({ data: { provider: "LEMON_SQUEEZY", providerEventId, eventName, resourceId, occurredAt } }).catch((error) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
        throw error;
      });
      if (!claimed) return "duplicate";
      if (!SUPPORTED_EVENTS.has(eventName)) return "ignored";

      if (SUBSCRIPTION_EVENTS.has(eventName)) {
        if (payload.data?.type !== "subscriptions") throw new BillingRejection("RESOURCE_TYPE_MISMATCH");
        if (!occurredAt) throw new BillingRejection("PROVIDER_TIMESTAMP_MISSING");
        const variantId = stringValue(attributes.variant_id);
        if (!variantId) throw new BillingRejection("VARIANT_MISSING");
        const providerStatus = String(attributes.status || "");

        if (eventName === "subscription_created") {
          if (!intentId) throw new BillingRejection("CHECKOUT_INTENT_MISSING");
          const intent = await tx.billingCheckoutIntent.findUnique({
            where: { publicIntentId: intentId },
            include: {
              plan: { select: { id: true, isActive: true, price: true, lemonSqueezyVariantId: true } },
              initiatingUser: { select: { isActive: true } },
            },
          });
          if (!intent || intent.status !== "PENDING" || intent.consumedAt || intent.expiresAt <= new Date()) throw new BillingRejection("CHECKOUT_INTENT_INVALID");
          if (!intent.initiatingUser.isActive) throw new BillingRejection("CHECKOUT_OWNER_INVALID");
          const membership = await tx.restaurantMember.findUnique({
            where: { userId_restaurantId: { userId: intent.initiatingUserId, restaurantId: intent.restaurantId } },
            select: { role: true },
          });
          if (membership?.role !== "RESTAURANT_OWNER") throw new BillingRejection("CHECKOUT_OWNER_INVALID");
          if (!intent.plan.isActive || Number(intent.plan.price) <= 0 || intent.variantId !== variantId || intent.plan.lemonSqueezyVariantId !== variantId) throw new BillingRejection("PLAN_VARIANT_MISMATCH");
          const consumed = await tx.billingCheckoutIntent.updateMany({
            where: { id: intent.id, status: "PENDING", consumedAt: null, expiresAt: { gt: new Date() } },
            data: { status: "CONSUMED", consumedAt: new Date() },
          });
          if (consumed.count !== 1) throw new BillingRejection("CHECKOUT_INTENT_REUSED");
          const alreadyBound = await tx.subscription.findUnique({ where: { providerSubscriptionId: resourceId }, select: { id: true } });
          if (alreadyBound) throw new BillingRejection("PROVIDER_SUBSCRIPTION_ALREADY_BOUND");
          await tx.subscription.updateMany({ where: { restaurantId: intent.restaurantId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, data: { status: "CANCELLED", endsAt: new Date() } });
          await tx.subscription.create({ data: {
            restaurantId: intent.restaurantId,
            planId: intent.planId,
            status: internalStatus(providerStatus) as "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED",
            provider: "LEMON_SQUEEZY",
            providerCustomerId: stringValue(attributes.customer_id),
            providerSubscriptionId: resourceId,
            providerOrderId: stringValue(attributes.order_id),
            providerVariantId: intent.variantId,
            providerStatus,
            providerUpdatedAt: occurredAt,
            trialEndsAt: dateValue(attributes.trial_ends_at),
            endsAt: dateValue(attributes.ends_at),
          } });
        } else {
          const existing = await tx.subscription.findUnique({
            where: { providerSubscriptionId: resourceId },
            select: { id: true, provider: true, providerUpdatedAt: true },
          });
          if (!existing || existing.provider !== "LEMON_SQUEEZY") throw new BillingRejection("SUBSCRIPTION_NOT_BOUND");
          const targetPlan = await tx.plan.findFirst({ where: { lemonSqueezyVariantId: variantId, isActive: true }, select: { id: true, price: true } });
          if (!targetPlan || Number(targetPlan.price) <= 0) throw new BillingRejection("PLAN_VARIANT_MISMATCH");
          if (existing.providerUpdatedAt && existing.providerUpdatedAt >= occurredAt) return "stale";
          await tx.subscription.update({ where: { id: existing.id }, data: {
            planId: targetPlan.id,
            status: internalStatus(providerStatus) as "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED",
            providerCustomerId: stringValue(attributes.customer_id),
            providerOrderId: stringValue(attributes.order_id),
            providerVariantId: variantId,
            providerStatus,
            providerUpdatedAt: occurredAt,
            trialEndsAt: dateValue(attributes.trial_ends_at),
            endsAt: dateValue(attributes.ends_at),
          } });
        }
      } else if (PAYMENT_EVENTS.has(eventName)) {
        if (payload.data?.type !== "subscription-invoices") throw new BillingRejection("RESOURCE_TYPE_MISMATCH");
        const subscriptionId = stringValue(attributes.subscription_id);
        const subscription = subscriptionId ? await tx.subscription.findUnique({ where: { providerSubscriptionId: subscriptionId }, select: { id: true, provider: true } }) : null;
        if (!subscription || subscription.provider !== "LEMON_SQUEEZY") throw new BillingRejection("SUBSCRIPTION_NOT_BOUND");
        const paymentStatus = eventName === "subscription_payment_failed" ? "FAILED" : eventName === "subscription_payment_refunded" ? "REFUNDED" : "PAID";
        await tx.payment.upsert({
          where: { reference: `${eventName}:${resourceId}` },
          create: { subscriptionId: subscription.id, amount: Number(attributes.total ?? 0) / 100, currency: String(attributes.currency || "USD"), status: paymentStatus, provider: "LEMON_SQUEEZY", reference: `${eventName}:${resourceId}`, providerOrderId: stringValue(attributes.order_id), providerSubscriptionId: subscriptionId, providerEventId },
          update: { status: paymentStatus, providerEventId },
        });
      } else if (eventName === "order_refunded") {
        if (payload.data?.type !== "orders") throw new BillingRejection("RESOURCE_TYPE_MISMATCH");
        if (!occurredAt) throw new BillingRejection("PROVIDER_TIMESTAMP_MISSING");
        const orderId = stringValue(attributes.order_id) || resourceId;
        await tx.payment.updateMany({ where: { providerOrderId: orderId }, data: { status: "REFUNDED", providerEventId } });
        await tx.subscription.updateMany({
          where: { provider: "LEMON_SQUEEZY", providerOrderId: orderId, OR: [{ providerUpdatedAt: null }, { providerUpdatedAt: { lt: occurredAt } }] },
          data: { status: "CANCELLED", endsAt: occurredAt, providerStatus: "refunded", providerUpdatedAt: occurredAt },
        });
      }
      return "processed";
    });

    console.info(JSON.stringify({ level: "info", context: "lemon-webhook", event: result === "duplicate" ? "duplicate_event" : "billing_event", eventName, resourceId, result, timestamp: new Date().toISOString() }));
    return Response.json({ received: true, result });
  } catch (error) {
    if (error instanceof BillingRejection) {
      rejectionLog({ eventName, resourceId, attributes, intentId, reason: error.reason });
      return apiError("WEBHOOK_REJECTED", error.status);
    }
    logApiError("lemon-webhook", error, { eventName, resourceId });
    return apiError("WEBHOOK_PROCESSING_FAILED", 500);
  }
}
