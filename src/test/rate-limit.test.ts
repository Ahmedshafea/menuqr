import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("memory rate limiter", () => {
  it("allows requests up to the limit and then rejects", () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    const blocked = rateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});
