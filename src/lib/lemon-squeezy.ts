import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API_URL = "https://api.lemonsqueezy.com/v1";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

export function verifyLemonSignature(rawBody: string, signature: string | null) {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createLemonCheckout(input: { variantId: string; checkoutIntentId: string; email?: string | null; name?: string | null }) {
  const response = await fetch(`${API_URL}/checkouts`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${required("LEMON_SQUEEZY_API_KEY")}`,
    },
    body: JSON.stringify({ data: { type: "checkouts", attributes: {
      product_options: { enabled_variants: [Number(input.variantId)], redirect_url: `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/dashboard/subscription?result=payment_pending` },
      checkout_data: { email: input.email || undefined, name: input.name || undefined, custom: { checkout_intent_id: input.checkoutIntentId } },
    }, relationships: {
      store: { data: { type: "stores", id: required("LEMON_SQUEEZY_STORE_ID") } },
      variant: { data: { type: "variants", id: input.variantId } },
    } } }),
  });
  if (!response.ok) throw new Error(`LEMON_CHECKOUT_FAILED_${response.status}`);
  const payload = await response.json() as { data?: { attributes?: { url?: string } } };
  if (!payload.data?.attributes?.url) throw new Error("LEMON_CHECKOUT_URL_MISSING");
  return payload.data.attributes.url;
}
