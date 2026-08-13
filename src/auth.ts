import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeOtp, hashOtp, OTP_LENGTH } from "@/lib/otp";
import { normalizeE164 } from "@/lib/whatsapp";
import { getCachedUserAccess } from "@/lib/user-access";
import { clearRateLimit, loginRateLimitKeys, rateLimit, requestIp } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = z
          .object({ email: z.email(), password: z.string().min(8) })
          .safeParse(raw);
        if (!parsed.success) return null;
        const buckets = loginRateLimitKeys(parsed.data.email, requestIp(request));
        const [clientLimit, pairLimit, accountLimit] = await Promise.all([
          rateLimit(buckets.client, 50, 15 * 60_000),
          rateLimit(buckets.pair, 10, 15 * 60_000),
          rateLimit(buckets.account, 100, 60 * 60_000),
        ]);
        if (!clientLimit.allowed || !pairLimit.allowed || !accountLimit.allowed)
          return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            isActive: true,
            sessionVersion: true,
            roles: { select: { role: true } },
            restaurantMemberships: {
              select: { restaurantId: true },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        });
        if (!user?.isActive || !(await compare(parsed.data.password, user.passwordHash)))
          return null;
        await clearRateLimit(buckets.account, buckets.pair);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles.map((item) => item.role),
          restaurantId: user.restaurantMemberships[0]?.restaurantId ?? null,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    Credentials({
      id: "whatsapp-otp",
      name: "WhatsApp OTP",
      credentials: { phone: {}, code: {} },
      async authorize(raw) {
        const parsed = z.object({ phone: z.string().min(8).max(30), code: z.string().regex(/^\d{4,8}$/) }).safeParse(raw);
        if (!parsed.success || parsed.data.code.length !== OTP_LENGTH) return null;
        let phone: string;
        try { phone = normalizeE164(parsed.data.phone); } catch { return null; }
        if (!(await rateLimit(`auth-otp:${hashOtp(phone, "auth-rate-limit")}`, 10, 15 * 60_000)).allowed) return null;
        const matches = await prisma.user.findMany({
          where: { phone: { in: [phone, phone.slice(1)] } },
          take: 2,
          select: {
            id: true, name: true, email: true, isActive: true, sessionVersion: true,
            roles: { select: { role: true } },
            restaurantMemberships: { select: { restaurantId: true }, orderBy: { createdAt: "asc" }, take: 1 },
          },
        });
        if (matches.length !== 1 || await consumeOtp(phone, parsed.data.code) !== "verified") return null;
        const user = matches[0];
        if (!user.isActive) return null;
        await prisma.user.update({ where: { id: user.id }, data: { phone, phoneVerifiedAt: new Date() } });
        return { id: user.id, name: user.name, email: user.email, roles: user.roles.map((item) => item.role), restaurantId: user.restaurantMemberships[0]?.restaurantId ?? null, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.roles = user.roles;
        token.restaurantId = user.restaurantId;
        token.sessionVersion = user.sessionVersion;
      } else if (token.sub) {
        const current = await prisma.user.findUnique({ where: { id: token.sub }, select: { isActive: true, sessionVersion: true } });
        if (!current?.isActive || token.sessionVersion !== current.sessionVersion) return null;
        const identity = await getCachedUserAccess(token.sub);
        token.roles = identity?.isActive ? identity.roles.map((item) => item.role) : [];
        token.restaurantId = identity?.isActive ? identity.restaurantMemberships[0]?.restaurantId ?? null : null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.restaurantId = token.restaurantId as string | null;
      }
      return session;
    },
  },
});
