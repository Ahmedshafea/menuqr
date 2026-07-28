import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiError, logApiError } from "@/lib/api";
import type { WhatsAppWebhookPayload } from "@/types/whatsapp";

export const runtime = "nodejs";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanEnvironmentValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

function validSignature(raw: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  return safeEqual(signature, expected);
}

function eventLog(event: string, metadata: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ level: "info", context: "whatsapp-webhook", event, ...metadata, timestamp: new Date().toISOString() }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode")?.trim();
  const token = url.searchParams.get("hub.verify_token")?.trim() || "";
  const challenge = url.searchParams.get("hub.challenge");
  const configured = cleanEnvironmentValue(process.env.WHATSAPP_VERIFY_TOKEN);
  if (!configured) {
    console.error(JSON.stringify({
      level: "error",
      context: "whatsapp-webhook",
      event: "verify_token_not_configured",
      timestamp: new Date().toISOString(),
    }));
    return new Response("Webhook verify token is not configured", { status: 503 });
  }
  if (mode === "subscribe" && challenge && safeEqual(token, configured))
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  console.warn(JSON.stringify({
    level: "warn",
    context: "whatsapp-webhook",
    event: "verification_rejected",
    modeValid: mode === "subscribe",
    challengePresent: Boolean(challenge),
    tokenPresent: Boolean(token),
    tokenLengthMatches: token.length === configured.length,
    timestamp: new Date().toISOString(),
  }));
  return new Response("Webhook verify token does not match", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) return apiError("INVALID_WEBHOOK_SIGNATURE", 403);
  let payload: WhatsAppWebhookPayload;
  try { payload = JSON.parse(raw) as WhatsAppWebhookPayload; }
  catch { return apiError("INVALID_WEBHOOK_PAYLOAD", 400); }
  if (payload.object !== "whatsapp_business_account") return apiError("INVALID_WEBHOOK_OBJECT", 400);
  try {
    for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const message of value?.messages ?? []) {
        await prisma.whatsAppMessage.upsert({
          where: { metaMessageId: message.id },
          create: { metaMessageId: message.id, direction: "INBOUND", status: "received" },
          update: {},
        });
        eventLog("message_received", { messageId: message.id, messageType: message.type });
      }
      for (const status of value?.statuses ?? []) {
        const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
        await prisma.whatsAppMessage.updateMany({
          where: { metaMessageId: status.id },
          data: {
            status: status.status,
            errorCode: status.errors?.[0]?.code ? String(status.errors[0].code) : null,
            ...(status.status === "sent" ? { sentAt: timestamp } : {}),
            ...(status.status === "delivered" ? { deliveredAt: timestamp } : {}),
            ...(status.status === "read" ? { readAt: timestamp } : {}),
            ...(status.status === "failed" ? { failedAt: timestamp } : {}),
          },
        });
        eventLog("delivery_status", { messageId: status.id, status: status.status });
      }
      if (change.field === "message_template_status_update" || value?.message_template_status)
        eventLog("template_status_update", { templateId: value?.message_template_id, status: value?.message_template_status, event: value?.event });
    }
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    logApiError("whatsapp-webhook", error);
    return apiError("WEBHOOK_PROCESSING_FAILED", 500);
  }
}
