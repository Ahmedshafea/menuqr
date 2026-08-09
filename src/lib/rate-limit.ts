import "server-only";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";

type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

export function loginRateLimitKeys(email: string, ip: string) {
  const identity = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const client = createHash("sha256").update(ip || "unknown").digest("hex");
  return { account: `auth-login-account:${identity}`, client: `auth-login-ip:${client}`, pair: `auth-login-pair:${identity}:${client}` };
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, NOW() + (${windowMs} * INTERVAL '1 millisecond'), NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= NOW() THEN NOW() + (${windowMs} * INTERVAL '1 millisecond') ELSE "RateLimitBucket"."resetAt" END,
      "updatedAt" = NOW()
    RETURNING "count", "resetAt"
  `;
  const current = rows[0];
  const retryAfter = Math.max(0, Math.ceil((current.resetAt.getTime() - Date.now()) / 1000));
  const result = { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfter };
  if (!result.allowed) console.warn(JSON.stringify({ level: "warn", context: "rate-limit", event: "request_rejected", bucket: key.split(":", 1)[0], timestamp: new Date().toISOString() }));
  return result;
}

export async function clearRateLimit(...keys: string[]) {
  if (!keys.length) return;
  await prisma.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
}

export function requestIp(request: Request) {
  if (process.env.VERCEL) return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (process.env.CF_PAGES) return request.headers.get("cf-connecting-ip") || "unknown";
  return process.env.NODE_ENV === "development" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown" : request.headers.get("x-real-ip") || "unknown";
}
