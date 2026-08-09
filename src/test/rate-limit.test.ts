import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => new Map<string, { count: number; resetAt: Date }>());
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn(async (_strings: TemplateStringsArray, key: string, windowMs: number) => {
  const now = Date.now();
  const existing = shared.get(key);
  const value = !existing || existing.resetAt.getTime() <= now ? { count: 1, resetAt: new Date(now + windowMs) } : { count: existing.count + 1, resetAt: existing.resetAt };
  shared.set(key, value);
  return [value];
}) } }));

import { rateLimit } from "@/lib/rate-limit";

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
});
