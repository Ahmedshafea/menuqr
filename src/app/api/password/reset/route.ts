import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { consumeOtp, OTP_LENGTH } from "@/lib/otp";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { normalizeE164 } from "@/lib/whatsapp";

export const runtime = "nodejs";

const schema = z
  .object({
    phone: z.string().trim().min(8).max(30),
    code: z.string().regex(/^\d{4,8}$/),
    password: z.string().min(8).max(128).regex(/[A-Z]/).regex(/[0-9]/),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "PASSWORD_MISMATCH",
  });

export async function POST(request: Request) {
  const ip = requestIp(request);
  const limited = rateLimit(`password-reset:${ip}`, 5, 15 * 60_000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.code.length !== OTP_LENGTH)
    return apiError("INVALID_PASSWORD_RESET", 400);

  try {
    const phone = normalizeE164(parsed.data.phone);
    const users = await prisma.user.findMany({
      where: { phone: { in: [phone, phone.slice(1)] } },
      take: 2,
      select: { id: true },
    });
    if (users.length !== 1) return apiError("INVALID_PASSWORD_RESET", 400);

    const result = await consumeOtp(phone, parsed.data.code);
    if (result === "expired") return apiError("OTP_EXPIRED", 410);
    if (result === "attempts_exceeded") return apiError("OTP_ATTEMPTS_EXCEEDED", 429);
    if (result !== "verified") return apiError("INVALID_OTP", 400);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: users[0].id },
        data: { passwordHash: await hash(parsed.data.password, 12), phoneVerifiedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({ where: { userId: users[0].id } }),
    ]);
    console.info(JSON.stringify({
      level: "info",
      context: "password-reset",
      event: "password_reset_completed",
      timestamp: new Date().toISOString(),
    }));
    return Response.json({ reset: true });
  } catch (error) {
    logApiError("password-reset", error, { ip });
    return apiError("PASSWORD_RESET_FAILED", 500);
  }
}
