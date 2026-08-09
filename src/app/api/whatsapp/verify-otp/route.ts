import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { consumeOtp, createOtpVerificationProof, OTP_LENGTH } from "@/lib/otp";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { normalizeE164, WhatsAppError } from "@/lib/whatsapp";

export const runtime = "nodejs";

const schema = z.object({ phone: z.string().min(8).max(30), code: z.string().regex(/^\d{4,8}$/) });

export async function POST(request: Request) {
  const limited = await rateLimit(`whatsapp-verify:${requestIp(request)}`, 10, 15 * 60_000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.code.length !== OTP_LENGTH) return apiError("INVALID_OTP", 400);
  try {
    const phone = normalizeE164(parsed.data.phone);
    const result = await consumeOtp(phone, parsed.data.code);
    if (result === "expired") return apiError("OTP_EXPIRED", 410);
    if (result === "attempts_exceeded") return apiError("OTP_ATTEMPTS_EXCEEDED", 429);
    if (result !== "verified") return apiError("INVALID_OTP", 400);
    const session = await auth();
    if (session?.user.id) await prisma.user.update({ where: { id: session.user.id }, data: { phone, phoneVerifiedAt: new Date() } });
    console.info(JSON.stringify({
      level: "info",
      context: "whatsapp-otp",
      event: "otp_verified",
      authenticatedUser: Boolean(session?.user.id),
      timestamp: new Date().toISOString(),
    }));
    return Response.json({
      verified: true,
      verificationToken: createOtpVerificationProof(phone),
    });
  } catch (error) {
    logApiError("whatsapp-verify-otp", error);
    if (error instanceof WhatsAppError) return apiError(error.code, error.status);
    return apiError("OTP_VERIFY_FAILED", 500);
  }
}
