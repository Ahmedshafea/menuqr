import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => new Map<string, { count: number; resetAt: Date }>());
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn(async (_strings: TemplateStringsArray, key: string, windowMs: number) => {
  const now = Date.now();
  const existing = shared.get(key);
  const value = !existing || existing.resetAt.getTime() <= now ? { count: 1, resetAt: new Date(now + windowMs) } : { count: existing.count + 1, resetAt: existing.resetAt };
  shared.set(key, value);
  return [value];
}) } }));

import { loginRateLimitKeys, rateLimit, requestIp } from "@/lib/rate-limit";

describe("database rate limiter", () => {
  beforeEach(() => shared.clear());

  it("allows requests up to the limit and then rejects", async () => {
    const key = `test:${crypto.randomUUID()}`;
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);
    const blocked = await rateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("shares counters between callers while isolating different keys", async () => {
    await rateLimit("otp:phone-a", 1, 60_000);
    expect((await rateLimit("otp:phone-a", 1, 60_000)).allowed).toBe(false);
    expect((await rateLimit("otp:phone-b", 1, 60_000)).allowed).toBe(true);
  });

  it("layers account, client, and account-client login buckets", () => {
    const sameVictimA = loginRateLimitKeys("Victim@Test.com", "198.51.100.1");
    const sameVictimB = loginRateLimitKeys("victim@test.com", "198.51.100.2");
    const otherVictimA = loginRateLimitKeys("other@test.com", "198.51.100.1");
    expect(sameVictimA.account).toBe(sameVictimB.account);
    expect(sameVictimA.pair).not.toBe(sameVictimB.pair);
    expect(sameVictimA.client).toBe(otherVictimA.client);
    expect(sameVictimA.pair).not.toBe(otherVictimA.pair);
  });

  it("does not trust X-Forwarded-For outside recognized development or proxy environments", () => {
    const previous = { nodeEnv: process.env.NODE_ENV, vercel: process.env.VERCEL, pages: process.env.CF_PAGES };
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", ""); vi.stubEnv("CF_PAGES", "");
    const request = new Request("https://app.test", { headers: { "x-forwarded-for": "attacker", "x-real-ip": "trusted-proxy-value" } });
    expect(requestIp(request)).toBe("trusted-proxy-value");
    vi.stubEnv("NODE_ENV", previous.nodeEnv ?? "test"); vi.stubEnv("VERCEL", previous.vercel ?? ""); vi.stubEnv("CF_PAGES", previous.pages ?? "");
  });
});
