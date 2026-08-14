import "server-only";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { passwordChangeRateLimitKeys, rateLimit } from "@/lib/rate-limit";

export type PasswordChangeResult = "changed" | "incorrect" | "invalid" | "mismatch" | "rate_limited";

type Dependencies = {
  findUser: (id: string) => Promise<{ passwordHash: string } | null>;
  updateUser: (id: string, expectedHash: string, passwordHash: string) => Promise<number>;
  limit: typeof rateLimit;
  comparePassword: typeof compare;
  hashPassword: typeof hash;
};

const defaults: Dependencies = {
  findUser: (id) => prisma.user.findFirst({ where: { id, isActive: true }, select: { passwordHash: true } }),
  updateUser: async (id, expectedHash, passwordHash) => (await prisma.user.updateMany({
    where: { id, isActive: true, passwordHash: expectedHash },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  })).count,
  limit: rateLimit,
  comparePassword: compare,
  hashPassword: hash,
};

export async function changeAuthenticatedPassword(input: {
  userId: string; ip: string; currentPassword: string; newPassword: string; confirmPassword: string;
}, dependencies: Dependencies = defaults): Promise<PasswordChangeResult> {
  const { userId, ip, currentPassword, newPassword, confirmPassword } = input;
  if (!userId || currentPassword.length < 1 || currentPassword.length > 128 || newPassword.length > 128 || confirmPassword.length > 128) return "invalid";
  if (newPassword !== confirmPassword) return "mismatch";
  if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return "invalid";
  const keys = passwordChangeRateLimitKeys(userId, ip);
  const [account, client] = await Promise.all([dependencies.limit(keys.account, 8, 15 * 60_000), dependencies.limit(keys.client, 30, 15 * 60_000)]);
  if (!account.allowed || !client.allowed) return "rate_limited";
  const user = await dependencies.findUser(userId);
  if (!user || !(await dependencies.comparePassword(currentPassword, user.passwordHash))) return "incorrect";
  const passwordHash = await dependencies.hashPassword(newPassword, 12);
  return (await dependencies.updateUser(userId, user.passwordHash, passwordHash)) === 1 ? "changed" : "incorrect";
}
