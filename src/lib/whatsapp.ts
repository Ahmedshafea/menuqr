import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  CustomerNotificationType, RestaurantNotificationType, SendTemplateInput,
  TemplateVariable, WhatsAppApiResponse, WhatsAppNotificationType, WhatsAppTemplateComponent,
} from "@/types/whatsapp";
import type { OrderStatus } from "@prisma/client";
import { InvalidPhoneError, normalizePhoneE164 } from "@/lib/phone";

function environmentValue(name: string) {
  const trimmed = process.env[name]?.trim() ?? "";
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

function metaTemplateLanguage(language: string) {
  if (language === "ar")
    return environmentValue("WHATSAPP_TEMPLATE_LANGUAGE_AR") || "ar_EG";
  if (language === "en")
    return environmentValue("WHATSAPP_TEMPLATE_LANGUAGE_EN") || "en";
  return language;
}

const CUSTOMER_TEMPLATES: Record<CustomerNotificationType, string> = {
  order_received: environmentValue("WHATSAPP_TEMPLATE_ORDER_RECEIVED") || "order_received",
  order_accepted: environmentValue("WHATSAPP_TEMPLATE_ORDER_ACCEPTED") || "order_accepted",
  order_preparing: environmentValue("WHATSAPP_TEMPLATE_ORDER_PREPARING") || "order_preparing",
  order_ready: environmentValue("WHATSAPP_TEMPLATE_ORDER_READY") || "order_ready",
  order_out_for_delivery: environmentValue("WHATSAPP_TEMPLATE_ORDER_OUT_FOR_DELIVERY") || "order_out_for_delivery",
  order_delivered: environmentValue("WHATSAPP_TEMPLATE_ORDER_DELIVERED") || "order_delivered",
  order_cancelled: environmentValue("WHATSAPP_TEMPLATE_ORDER_CANCELLED") || "order_cancelled",
  payment_successful: environmentValue("WHATSAPP_TEMPLATE_PAYMENT_SUCCESSFUL") || "payment_successful",
  payment_failed: environmentValue("WHATSAPP_TEMPLATE_PAYMENT_FAILED") || "payment_failed",
};

const RESTAURANT_TEMPLATES: Record<RestaurantNotificationType, string> = {
  new_order: environmentValue("WHATSAPP_TEMPLATE_NEW_ORDER") || "new_restaurant_order",
  order_cancelled: environmentValue("WHATSAPP_TEMPLATE_RESTAURANT_ORDER_CANCELLED") || "restaurant_order_cancelled",
  customer_paid: environmentValue("WHATSAPP_TEMPLATE_CUSTOMER_PAID") || "customer_paid",
  subscription_expiring: environmentValue("WHATSAPP_TEMPLATE_SUBSCRIPTION_EXPIRING") || "subscription_expiring",
  subscription_expired: environmentValue("WHATSAPP_TEMPLATE_SUBSCRIPTION_EXPIRED") || "subscription_expired",
  new_customer_message: environmentValue("WHATSAPP_TEMPLATE_NEW_CUSTOMER_MESSAGE") || "new_customer_message",
};

export const WHATSAPP_NOTIFICATION_TYPES = [
  ...Object.keys(CUSTOMER_TEMPLATES), ...Object.keys(RESTAURANT_TEMPLATES),
] as [WhatsAppNotificationType, ...WhatsAppNotificationType[]];

export class WhatsAppError extends Error {
  constructor(
    public code: string,
    public status: number,
    public retryAfter?: number,
    public meta?: {
      httpStatus?: number;
      code?: number;
      subcode?: number;
      message?: string;
    },
  ) {
    super(code);
  }
}

export function normalizeE164(input: string) {
  try {
    return normalizePhoneE164(input);
  } catch (error) {
    if (error instanceof InvalidPhoneError)
      throw new WhatsAppError("INVALID_PHONE", 400);
    throw error;
  }
}

function config() {
  const token =
    environmentValue("WHATSAPP_ACCESS_TOKEN") ||
    environmentValue("WHATSAPP_TOKEN");
  const phoneNumberId = environmentValue("WHATSAPP_PHONE_NUMBER_ID");
  const wabaId = environmentValue("WHATSAPP_WABA_ID");
  const version = environmentValue("WHATSAPP_API_VERSION") || "v23.0";
  if (!token || !phoneNumberId)
    throw new WhatsAppError("WHATSAPP_NOT_CONFIGURED", 503);
  return { token, phoneNumberId, wabaId, version, baseUrl: `https://graph.facebook.com/${version}` };
}

export function isWhatsAppConfigured() {
  return Boolean(
    (environmentValue("WHATSAPP_ACCESS_TOKEN") ||
      environmentValue("WHATSAPP_TOKEN")) &&
      environmentValue("WHATSAPP_PHONE_NUMBER_ID"),
  );
}

export function getWhatsAppConfigurationStatus() {
  return {
    accessToken: Boolean(
      environmentValue("WHATSAPP_ACCESS_TOKEN") ||
        environmentValue("WHATSAPP_TOKEN"),
    ),
    phoneNumberId: Boolean(environmentValue("WHATSAPP_PHONE_NUMBER_ID")),
    wabaId: Boolean(environmentValue("WHATSAPP_WABA_ID")),
    verifyToken: Boolean(environmentValue("WHATSAPP_VERIFY_TOKEN")),
    appSecret: Boolean(environmentValue("WHATSAPP_APP_SECRET")),
    otpTemplate: Boolean(
      environmentValue("WHATSAPP_TEMPLATE_OTP") ||
        environmentValue("WHATSAPP_OTP_TEMPLATE"),
    ),
  };
}

function log(level: "info" | "error", event: string, metadata: Record<string, unknown> = {}) {
  const writer = level === "error" ? console.error : console.info;
  writer(JSON.stringify({ level, context: "whatsapp", event, ...metadata, timestamp: new Date().toISOString() }));
}

function safeMetaMessage(message: string | undefined) {
  return message
    ?.slice(0, 300)
    .replace(/\+?\d{8,15}/g, "[redacted-phone]");
}

async function graphRequest<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const { token, baseUrl } = config();
  const url = `${baseUrl}/${path}`;
  let payloadSummary: Record<string, unknown> | undefined;
  if (typeof init.body === "string") {
    try {
      const payload = JSON.parse(init.body) as {
        to?: string;
        type?: string;
        template?: {
          name?: string;
          language?: { code?: string };
          components?: Array<{
            type?: string;
            parameters?: unknown[];
          }>;
        };
      };
      payloadSummary = {
        type: payload.type,
        templateName: payload.template?.name,
        language: payload.template?.language?.code,
        components: payload.template?.components?.map((component) => ({
          type: component.type,
          parameterCount: component.parameters?.length ?? 0,
        })),
        recipient: payload.to
          ? `${payload.to.slice(0, 3)}***${payload.to.slice(-2)}`
          : undefined,
      };
    } catch {
      payloadSummary = { bodyPresent: true };
    }
  }
  for (let attempt = 0; attempt < (retry ? 3 : 1); attempt++) {
    let response: Response;
    try {
      log("info", "api_request", {
        url,
        method: init.method || "GET",
        attempt: attempt + 1,
        payload: payloadSummary,
      });
      response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt)); continue; }
      throw new WhatsAppError(error instanceof Error && error.name === "TimeoutError" ? "WHATSAPP_TIMEOUT" : "WHATSAPP_NETWORK_ERROR", 503);
    }
    const body = await response.json().catch(() => ({})) as { error?: { code?: number; message?: string; error_subcode?: number } } & T;
    if (response.ok) {
      const successful = body as {
        messages?: Array<{ id?: string; message_status?: string }>;
      };
      log("info", "api_response", {
        url,
        status: response.status,
        messageAccepted: Boolean(successful.messages?.[0]?.id),
        messageStatus: successful.messages?.[0]?.message_status,
      });
      return body;
    }
    const retryAfter = Number(response.headers.get("retry-after") || 0) || undefined;
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, Math.min((retryAfter ?? 1) * 1000, 3000)));
      continue;
    }
    const code =
      body.error?.code === 132001
        ? "WHATSAPP_TEMPLATE_NOT_FOUND"
        : response.status === 401
          ? "WHATSAPP_TOKEN_EXPIRED"
          : response.status === 429
            ? "WHATSAPP_RATE_LIMITED"
            : "WHATSAPP_API_ERROR";
    log("error", "api_error", {
      url,
      templateName: payloadSummary?.templateName,
      recipient: payloadSummary?.recipient,
      status: response.status,
      metaCode: body.error?.code,
      subcode: body.error?.error_subcode,
      metaMessage: safeMetaMessage(body.error?.message),
    });
    throw new WhatsAppError(
      code,
      response.status === 429 ? 429 : 502,
      retryAfter,
      {
        httpStatus: response.status,
        code: body.error?.code,
        subcode: body.error?.error_subcode,
        message: safeMetaMessage(body.error?.message),
      },
    );
  }
  throw new WhatsAppError("WHATSAPP_API_ERROR", 502);
}

async function record(response: WhatsAppApiResponse, input: { notificationType?: string; templateName?: string }) {
  const id = response.messages?.[0]?.id;
  if (!id)
    throw new WhatsAppError("WHATSAPP_INVALID_RESPONSE", 502, undefined, {
      message: "Meta response did not include a message id",
    });
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
        language: { code: metaTemplateLanguage(input.language || "ar") },
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
  const english = language.toLowerCase().startsWith("en");
  const templateName =
    environmentValue(
      english ? "WHATSAPP_TEMPLATE_OTP_EN" : "WHATSAPP_TEMPLATE_OTP_AR",
    ) ||
    environmentValue("WHATSAPP_TEMPLATE_OTP") ||
    environmentValue("WHATSAPP_OTP_TEMPLATE") ||
    "otp_verification";
  const templateLanguage =
    environmentValue(
      english
        ? "WHATSAPP_TEMPLATE_OTP_LANGUAGE_EN"
        : "WHATSAPP_TEMPLATE_OTP_LANGUAGE_AR",
    ) ||
    metaTemplateLanguage(english ? "en" : "ar");
  return sendTemplate({
    to,
    templateName,
    language: templateLanguage,
    notificationType: "otp",
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
  total: string | number;
  orderType: string;
  orderTime: string;
  customerOrderUrl: string;
  restaurantOrderUrl: string;
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
      [
        input.customerName,
        input.orderNumber,
        input.total,
        input.customerOrderUrl,
      ],
      language,
    ),
    sendRestaurantNotification(
      "new_order",
      input.restaurantPhone,
      [
        input.orderNumber,
        input.customerName,
        input.total,
        input.orderType,
        input.orderTime,
        input.restaurantOrderUrl,
      ],
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

const ORDER_STATUS_NOTIFICATIONS: Partial<
  Record<OrderStatus, CustomerNotificationType>
> = {
  PREPARING: "order_preparing",
  READY: "order_ready",
  OUT_FOR_DELIVERY: "order_out_for_delivery",
  DELIVERED: "order_delivered",
  CANCELLED: "order_cancelled",
};

export async function sendOrderStatusNotification(input: {
  orderId: string;
  status: OrderStatus;
  orderNumber: string;
  customerPhone: string;
  restaurantName: string;
  customerOrderUrl: string;
  language?: string;
}) {
  const notificationType = ORDER_STATUS_NOTIFICATIONS[input.status];
  if (!notificationType) return;
  if (!isWhatsAppConfigured()) {
    log("error", "order_status_notification_skipped", {
      reason: "not_configured",
      orderId: input.orderId,
      status: input.status,
    });
    return;
  }
  try {
    await sendCustomerNotification(
      notificationType,
      input.customerPhone,
      [input.orderNumber, input.restaurantName, input.customerOrderUrl],
      input.language || "ar",
    );
  } catch (error) {
    log("error", "order_status_notification_failed", {
      orderId: input.orderId,
      status: input.status,
      code:
        error instanceof WhatsAppError
          ? error.code
          : "WHATSAPP_SEND_FAILED",
    });
  }
}

export async function listTemplates() {
  const { wabaId } = config();
  if (!wabaId) throw new WhatsAppError("WHATSAPP_WABA_NOT_CONFIGURED", 503);
  return graphRequest<{ data?: unknown[] }>(`${wabaId}/message_templates?fields=id,name,status,language,category&limit=100`, { method: "GET" }, false);
}
