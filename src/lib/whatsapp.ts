import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  CustomerNotificationType, RestaurantNotificationType, SendTemplateInput,
  TemplateVariable, WhatsAppApiResponse, WhatsAppNotificationType, WhatsAppTemplateComponent,
} from "@/types/whatsapp";

const CUSTOMER_TEMPLATES: Record<CustomerNotificationType, string> = {
  order_received: "menuqr_order_received",
  order_accepted: "menuqr_order_accepted",
  order_preparing: "menuqr_order_preparing",
  order_ready: "menuqr_order_ready",
  order_out_for_delivery: "menuqr_order_out_for_delivery",
  order_delivered: "menuqr_order_delivered",
  order_cancelled: "menuqr_order_cancelled",
  payment_successful: "menuqr_payment_successful",
  payment_failed: "menuqr_payment_failed",
};

const RESTAURANT_TEMPLATES: Record<RestaurantNotificationType, string> = {
  new_order: "menuqr_new_order",
  order_cancelled: "menuqr_restaurant_order_cancelled",
  customer_paid: "menuqr_customer_paid",
  subscription_expiring: "menuqr_subscription_expiring",
  subscription_expired: "menuqr_subscription_expired",
  new_customer_message: "menuqr_new_customer_message",
};

export const WHATSAPP_NOTIFICATION_TYPES = [
  ...Object.keys(CUSTOMER_TEMPLATES), ...Object.keys(RESTAURANT_TEMPLATES),
] as [WhatsAppNotificationType, ...WhatsAppNotificationType[]];

export class WhatsAppError extends Error {
  constructor(public code: string, public status: number, public retryAfter?: number) { super(code); }
}

export function normalizeE164(input: string) {
  const trimmed = input.trim();
  const prefixed = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const normalized = `+${prefixed.replace(/\D/g, "")}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new WhatsAppError("INVALID_PHONE", 400);
  return normalized;
}

function config() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  if (!token || !phoneNumberId || !wabaId) throw new WhatsAppError("WHATSAPP_NOT_CONFIGURED", 503);
  return { token, phoneNumberId, wabaId, version, baseUrl: `https://graph.facebook.com/${version}` };
}

export function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_WABA_ID);
}

function log(level: "info" | "error", event: string, metadata: Record<string, unknown> = {}) {
  const writer = level === "error" ? console.error : console.info;
  writer(JSON.stringify({ level, context: "whatsapp", event, ...metadata, timestamp: new Date().toISOString() }));
}

async function graphRequest<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const { token, baseUrl } = config();
  for (let attempt = 0; attempt < (retry ? 3 : 1); attempt++) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt)); continue; }
      throw new WhatsAppError(error instanceof Error && error.name === "TimeoutError" ? "WHATSAPP_TIMEOUT" : "WHATSAPP_NETWORK_ERROR", 503);
    }
    const body = await response.json().catch(() => ({})) as { error?: { code?: number; message?: string; error_subcode?: number } } & T;
    if (response.ok) return body;
    const retryAfter = Number(response.headers.get("retry-after") || 0) || undefined;
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, Math.min((retryAfter ?? 1) * 1000, 3000)));
      continue;
    }
    const code = response.status === 401 ? "WHATSAPP_TOKEN_EXPIRED" : response.status === 429 ? "WHATSAPP_RATE_LIMITED" : "WHATSAPP_API_ERROR";
    log("error", "api_error", { status: response.status, metaCode: body.error?.code, subcode: body.error?.error_subcode });
    throw new WhatsAppError(code, response.status === 429 ? 429 : 502, retryAfter);
  }
  throw new WhatsAppError("WHATSAPP_API_ERROR", 502);
}

async function record(response: WhatsAppApiResponse, input: { notificationType?: string; templateName?: string }) {
  const id = response.messages?.[0]?.id;
  if (!id) throw new WhatsAppError("WHATSAPP_INVALID_RESPONSE", 502);
  await prisma.whatsAppMessage.upsert({
    where: { metaMessageId: id },
    create: { metaMessageId: id, notificationType: input.notificationType, templateName: input.templateName, status: response.messages?.[0]?.message_status || "accepted" },
    update: {},
  });
  log("info", "message_accepted", { messageId: id, notificationType: input.notificationType });
  return { messageId: id, status: response.messages?.[0]?.message_status || "accepted" };
}

function bodyComponent(variables: TemplateVariable[]): WhatsAppTemplateComponent[] {
  return variables.length ? [{ type: "body", parameters: variables.map((value) => ({ type: "text", text: String(value).slice(0, 1024) })) }] : [];
}

export async function sendTemplate(input: SendTemplateInput) {
  const { phoneNumberId } = config();
  const to = normalizeE164(input.to).slice(1);
  const response = await graphRequest<WhatsAppApiResponse>(`${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language || "ar" },
        components: input.components ?? bodyComponent(input.variables ?? []),
      },
    }),
  });
  return record(response, { notificationType: input.notificationType, templateName: input.templateName });
}

export async function sendText(toInput: string, text: string) {
  const { phoneNumberId } = config();
  const to = normalizeE164(toInput).slice(1);
  if (!text.trim() || text.length > 4096) throw new WhatsAppError("INVALID_MESSAGE", 400);
  const response = await graphRequest<WhatsAppApiResponse>(`${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text.trim() } }),
  });
  return record(response, {});
}

export function sendOTP(to: string, code: string, language = "ar") {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE || "menuqr_otp";
  return sendTemplate({
    to, templateName, language, notificationType: "otp",
    components: [
      { type: "body", parameters: [{ type: "text", text: code }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
    ],
  });
}

export function sendCustomerNotification(type: CustomerNotificationType, to: string, variables: TemplateVariable[], language = "ar") {
  return sendTemplate({ to, templateName: CUSTOMER_TEMPLATES[type], variables, language, notificationType: type });
}

export function sendRestaurantNotification(type: RestaurantNotificationType, to: string, variables: TemplateVariable[], language = "ar") {
  return sendTemplate({ to, templateName: RESTAURANT_TEMPLATES[type], variables, language, notificationType: type });
}

interface SendOrderCreatedNotificationsInput {
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  restaurantPhone: string;
  customerName: string;
  customerPhone: string;
  total: number;
  trackingUrl: string;
  language?: string;
}

/**
 * Sends both sides of the new-order conversation through the existing
 * approved-template service. Notification failures are deliberately contained
 * here so a Meta outage can never roll back or fail an accepted order.
 */
export async function sendOrderCreatedNotifications(
  input: SendOrderCreatedNotificationsInput,
) {
  if (!isWhatsAppConfigured()) {
    log("error", "order_notifications_skipped", {
      reason: "not_configured",
      orderId: input.orderId,
    });
    return;
  }

  const language = input.language || "ar";
  const notifications = await Promise.allSettled([
    sendCustomerNotification(
      "order_received",
      input.customerPhone,
      [input.orderNumber, input.restaurantName, input.trackingUrl],
      language,
    ),
    sendRestaurantNotification(
      "new_order",
      input.restaurantPhone,
      [input.orderNumber, input.customerName, input.total, input.trackingUrl],
      language,
    ),
  ]);

  notifications.forEach((result, index) => {
    if (result.status === "rejected") {
      const error = result.reason;
      log("error", "order_notification_failed", {
        audience: index === 0 ? "customer" : "restaurant",
        orderId: input.orderId,
        code:
          error instanceof WhatsAppError
            ? error.code
            : "WHATSAPP_SEND_FAILED",
      });
    }
  });
}

export async function listTemplates() {
  const { wabaId } = config();
  return graphRequest<{ data?: unknown[] }>(`${wabaId}/message_templates?fields=id,name,status,language,category&limit=100`, { method: "GET" }, false);
}
