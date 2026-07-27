import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { generateOtp, hashOtp, otpExpiry } from "@/lib/otp";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { normalizeE164, sendOTP, WhatsAppError } from "@/lib/whatsapp";

export const runtime = "nodejs";

const schema = z.object({ phone: z.string().min(8).max(30), language: z.enum(["ar", "en"]).default("ar") });

export async function POST(request: Request) {
  const limited = rateLimit(`whatsapp-otp:${requestIp(request)}`, 5, 15 * 60_000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_OTP_REQUEST", 400);
  try {
    const phone = normalizeE164(parsed.data.phone);
    const phoneLimit = rateLimit(`whatsapp-otp-phone:${hashOtp(phone, "rate-limit")}`, 3, 15 * 60_000);
    if (!phoneLimit.allowed) return rateLimitError(phoneLimit.retryAfter);
    const code = generateOtp();
    await sendOTP(phone, code, parsed.data.language);
    await prisma.whatsAppOtp.upsert({
      where: { phone },
      create: { phone, codeHash: hashOtp(phone, code), expiresAt: otpExpiry() },
      update: { codeHash: hashOtp(phone, code), expiresAt: otpExpiry(), verifiedAt: null, attempts: 0 },
    });
    return Response.json({ sent: true });
  } catch (error) {
    logApiError("whatsapp-send-otp", error);
    if (error instanceof WhatsAppError) return apiError(error.code, error.status);
    return apiError(error instanceof Error ? error.message : "OTP_SEND_FAILED", 500);
  }
}

