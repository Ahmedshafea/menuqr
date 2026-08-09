import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";
import { getTranslations } from "next-intl/server";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { normalizeE164 } from "@/lib/whatsapp";
import { verifyOtpVerificationProof } from "@/lib/otp";
import { z } from "zod";
import { createInitialSubscription } from "@/lib/subscription-plans";
import { getConfigValue } from "@/lib/platform-config";

const verifiedRegistrationSchema = registerSchema.extend({
  otpVerificationToken: z.string().min(20),
});

export async function POST(request: Request) {
  if (!(await getConfigValue("registration", "enabled", true)))
    return apiError("REGISTRATION_DISABLED", 403);
  const ip = requestIp(request);
  const limited = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!(await verifyTurnstile(request, body?.turnstileToken)))
    return apiError("TURNSTILE_FAILED", 400);
  const parsed = verifiedRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    const t = await getTranslations("validation");
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const firstMessage =
      field === "email"
        ? t("email")
        : field === "whatsapp"
          ? t("phone")
          : field === "slug"
            ? issue?.code === "too_small"
              ? t("slugMin")
              : t("slugInvalid")
            : field === "password"
              ? issue?.message.includes("uppercase")
                ? t("passwordUpper")
                : issue?.message.includes("number")
                  ? t("passwordNumber")
                  : t("passwordLength")
              : field === "name" || field === "restaurantName"
                ? t("nameMin")
                : t("invalid");
    return apiError("INVALID_REGISTRATION", 400, {
      message: firstMessage,
      fields: details.fieldErrors,
    });
  }
  const data = parsed.data;
  const phone = normalizeE164(data.whatsapp);
  if (!verifyOtpVerificationProof(data.otpVerificationToken, phone))
    return apiError("PHONE_NOT_VERIFIED", 403);
  try {
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true, passwordHash: true } });
    if (existing && !(await compare(data.password, existing.passwordHash)))
      return apiError("ACCOUNT_EXISTS", 409);
    const user = await prisma.$transaction(async (tx) => {
      const verifiedOtp = await tx.whatsAppOtp.deleteMany({
        where: {
          phone,
          verifiedAt: { not: null },
          expiresAt: { gt: new Date() },
        },
      });
      if (verifiedOtp.count !== 1) throw new Error("PHONE_NOT_VERIFIED");
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { roles: { connectOrCreate: { where: { userId_role: { userId: existing.id, role: "RESTAURANT_OWNER" } }, create: { role: "RESTAURANT_OWNER" } } } } })
        : await tx.user.create({ data: { name: data.name, email: data.email, phone, phoneVerifiedAt: new Date(), passwordHash: await hash(data.password, 12), roles: { create: { role: "RESTAURANT_OWNER" } } } });
      if (existing)
        await tx.user.update({
          where: { id: existing.id },
          data: { phone, phoneVerifiedAt: new Date() },
        });
      const restaurant = await tx.restaurant.create({
        data: {
          name: data.restaurantName,
          slug: data.slug,
          whatsapp: data.whatsapp,
          members: {
            create: { userId: user.id, role: "RESTAURANT_OWNER" },
          },
          settings: { create: {} },
          branches: {
            create: {
              name: data.restaurantName,
              slug: "main",
              address: "",
              phone,
              useRestaurantWhatsapp: true,
              workingHours: {
                create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  opensAt: "00:00",
                  closesAt: "23:59",
                  isClosed: false,
                })),
              },
            },
          },
        },
      });
      await createInitialSubscription(tx, restaurant.id);
      return user;
    });
    console.info(JSON.stringify({
      level: "info",
      context: "registration",
      event: "account_created_after_phone_verification",
      userId: user.id,
      timestamp: new Date().toISOString(),
    }));
    return Response.json({ id: user.id }, { status: 201 });
  } catch (error) {
    logApiError("register", error, { ip });
    if (error instanceof Error && error.message === "PHONE_NOT_VERIFIED")
      return apiError("PHONE_NOT_VERIFIED", 403);
    return apiError("ACCOUNT_EXISTS", 409);
  }
}
