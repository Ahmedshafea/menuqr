import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeOtp, hashOtp, OTP_LENGTH } from "@/lib/otp";
import { normalizeE164 } from "@/lib/whatsapp";
import { getCachedUserAccess } from "@/lib/user-access";
import { rateLimit } from "@/lib/rate-limit";
import { createHash } from "node:crypto";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = z
          .object({ email: z.email(), password: z.string().min(8) })
          .safeParse(raw);
        if (!parsed.success) return null;
        const loginBucket = createHash("sha256").update(parsed.data.email.toLowerCase()).digest("hex");
        if (!(await rateLimit(`auth-login:${loginBucket}`, 10, 15 * 60_000)).allowed) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            isActive: true,
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
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles.map((item) => item.role),
          restaurantId: user.restaurantMemberships[0]?.restaurantId ?? null,
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
            id: true, name: true, email: true, isActive: true,
            roles: { select: { role: true } },
            restaurantMemberships: { select: { restaurantId: true }, orderBy: { createdAt: "asc" }, take: 1 },
          },
        });
        if (matches.length !== 1 || await consumeOtp(phone, parsed.data.code) !== "verified") return null;
        const user = matches[0];
        if (!user.isActive) return null;
        await prisma.user.update({ where: { id: user.id }, data: { phone, phoneVerifiedAt: new Date() } });
        return { id: user.id, name: user.name, email: user.email, roles: user.roles.map((item) => item.role), restaurantId: user.restaurantMemberships[0]?.restaurantId ?? null };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.roles = user.roles;
        token.restaurantId = user.restaurantId;
      } else if (token.sub) {
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
