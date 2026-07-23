import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            roles: { select: { role: true } },
            restaurantMemberships: {
              select: { restaurantId: true },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        });
        if (!user || !(await compare(parsed.data.password, user.passwordHash)))
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
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.roles = user.roles;
        token.restaurantId = user.restaurantId;
      } else if (!Array.isArray(token.roles) && token.sub) {
        const identity = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            roles: { select: { role: true } },
            restaurantMemberships: { select: { restaurantId: true }, orderBy: { createdAt: "asc" }, take: 1 },
          },
        });
        token.roles = identity?.roles.map((item) => item.role) ?? [];
        token.restaurantId = identity?.restaurantMemberships[0]?.restaurantId ?? null;
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
