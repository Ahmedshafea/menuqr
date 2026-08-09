import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { generateOtp, hashOtp, otpExpiry } from "@/lib/otp";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import {
  getWhatsAppConfigurationStatus,
  normalizeE164,
  sendOTP,
  WhatsAppError,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().trim().min(8).max(30),
  language: z.enum(["ar", "en"]).optional().default("ar"),
});

function debug(
  requestId: string,
  step: string,
  metadata: Record<string, unknown> = {},
) {
  console.info(
    JSON.stringify({
      level: "info",
      context: "whatsapp-send-otp",
      requestId,
      step,
      ...metadata,
      timestamp: new Date().toISOString(),
    }),
  );
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  debug(requestId, "STEP_1_REQUEST_RECEIVED", {
    contentType: request.headers.get("content-type"),
  });
  const limited = await rateLimit(`whatsapp-otp:${requestIp(request)}`, 5, 15 * 60_000);
  if (!limited.allowed) {
    debug(requestId, "STOP_RATE_LIMITED", {
      retryAfter: limited.retryAfter,
    });
    return rateLimitError(limited.retryAfter);
  }

  const body = await request.json().catch(() => null);
  const bodyRecord =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  debug(requestId, "STEP_2_REQUEST_PARSED", {
    bodyIsObject: Boolean(bodyRecord),
    bodyKeys: bodyRecord ? Object.keys(bodyRecord) : [],
    phonePresent: typeof bodyRecord?.phone === "string",
    phoneLength:
      typeof bodyRecord?.phone === "string"
        ? bodyRecord.phone.trim().length
        : 0,
    language:
      typeof bodyRecord?.language === "string"
        ? bodyRecord.language
        : "default",
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    debug(requestId, "STOP_REQUEST_VALIDATION_FAILED", {
      reason: "INVALID_OTP_REQUEST",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      })),
    });
    return apiError("INVALID_OTP_REQUEST", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  debug(requestId, "STEP_3_REQUEST_VALIDATED", {
    language: parsed.data.language,
  });

  try {
    const phone = normalizeE164(parsed.data.phone);
    debug(requestId, "STEP_4_PHONE_NORMALIZED", {
      normalizedLength: phone.length,
      countryCodeConfigured: Boolean(
        process.env.DEFAULT_PHONE_COUNTRY_CODE || "20",
      ),
    });

    const configuration = getWhatsAppConfigurationStatus();
    debug(requestId, "STEP_5_ENVIRONMENT_CHECKED", configuration);
    if (!configuration.accessToken || !configuration.phoneNumberId) {
      debug(requestId, "STOP_WHATSAPP_NOT_CONFIGURED", configuration);
      return apiError("WHATSAPP_NOT_CONFIGURED", 503);
    }

    const phoneLimit = await rateLimit(`whatsapp-otp-phone:${hashOtp(phone, "rate-limit")}`, 3, 15 * 60_000);
    if (!phoneLimit.allowed) {
      debug(requestId, "STOP_PHONE_RATE_LIMITED", {
        retryAfter: phoneLimit.retryAfter,
      });
      return rateLimitError(phoneLimit.retryAfter);
    }
    const code = generateOtp();
    debug(requestId, "STEP_6_OTP_GENERATED", {
      otpLength: code.length,
    });
    await prisma.whatsAppOtp.upsert({
      where: { phone },
      create: { phone, codeHash: hashOtp(phone, code), expiresAt: otpExpiry() },
      update: { codeHash: hashOtp(phone, code), expiresAt: otpExpiry(), verifiedAt: null, attempts: 0 },
    });
    debug(requestId, "STEP_7_OTP_PERSISTED");
    try {
      debug(requestId, "STEP_8_CALLING_META_API");
      await sendOTP(phone, code, parsed.data.language);
    } catch (error) {
      await prisma.whatsAppOtp.deleteMany({ where: { phone } });
      throw error;
    }
    console.info(JSON.stringify({
      level: "info",
      context: "whatsapp-otp",
      event: "otp_sent",
      requestId,
      timestamp: new Date().toISOString(),
    }));
    return Response.json({ sent: true });
  } catch (error) {
    const code =
      error instanceof WhatsAppError
        ? error.code
        : error instanceof Error
          ? error.message
          : "OTP_SEND_FAILED";
    debug(requestId, "STOP_ERROR", {
      reason: code,
      status: error instanceof WhatsAppError ? error.status : 500,
      ...(error instanceof WhatsAppError
        ? {
            metaHttpStatus: error.meta?.httpStatus,
            metaCode: error.meta?.code,
            metaSubcode: error.meta?.subcode,
            metaMessage: error.meta?.message,
          }
        : {}),
    });
    logApiError("whatsapp-send-otp", error, { requestId });
    if (error instanceof WhatsAppError)
      return apiError(error.code, error.status, {
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
        ...(error.meta
          ? {
              meta: {
                httpStatus: error.meta.httpStatus,
                code: error.meta.code,
                subcode: error.meta.subcode,
                message: error.meta.message,
              },
            }
          : {}),
        requestId,
      });
    return apiError(error instanceof Error ? error.message : "OTP_SEND_FAILED", 500);
  }
}
