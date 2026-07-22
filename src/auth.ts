import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [Credentials({ credentials: { email: {}, password: {} }, async authorize(raw) {
    const parsed = z.object({ email: z.email(), password: z.string().min(8) }).safeParse(raw);
    if (!parsed.success) return null;
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user || !(await compare(parsed.data.password, user.passwordHash))) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role, restaurantId: user.restaurantId };
  } })],
  callbacks: {
    jwt({ token, user }) { if (user) { token.role = user.role; token.restaurantId = user.restaurantId; } return token; },
    session({ session, token }) { if (session.user) { session.user.id = token.sub!; session.user.role = token.role as string; session.user.restaurantId = token.restaurantId as string | null; } return session; }
  }
});
