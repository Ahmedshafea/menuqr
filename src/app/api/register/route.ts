import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";
import { getTranslations } from "next-intl/server";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
export async function POST(request: Request) {
  const ip = requestIp(request);
  const limited = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!(await verifyTurnstile(request, body?.turnstileToken)))
    return apiError("TURNSTILE_FAILED", 400);
  const parsed = registerSchema.safeParse(body);
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
  try {
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true, passwordHash: true } });
    if (existing && !(await compare(data.password, existing.passwordHash)))
      return apiError("ACCOUNT_EXISTS", 409);
    const user = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { roles: { connectOrCreate: { where: { userId_role: { userId: existing.id, role: "RESTAURANT_OWNER" } }, create: { role: "RESTAURANT_OWNER" } } } } })
        : await tx.user.create({ data: { name: data.name, email: data.email, passwordHash: await hash(data.password, 12), roles: { create: { role: "RESTAURANT_OWNER" } } } });
      await tx.restaurant.create({
        data: {
          name: data.restaurantName,
          slug: data.slug,
          whatsapp: data.whatsapp,
          members: {
            create: { userId: user.id, role: "RESTAURANT_OWNER" },
          },
          settings: { create: {} },
        },
      });
      return user;
    });
    return Response.json({ id: user.id }, { status: 201 });
  } catch (error) {
    logApiError("register", error, { ip });
    return apiError("ACCOUNT_EXISTS", 409);
  }
}
