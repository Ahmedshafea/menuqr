import { afterEach, describe, expect, it, vi } from "vitest";
import { logApiError, sanitizeLogMetadata } from "@/lib/api";

describe("safe API logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts sensitive fields while retaining safe diagnostics", () => {
    expect(sanitizeLogMetadata({ requestId: "req-1", phone: "+201234", nested: { accessToken: "secret", status: 503 } }))
      .toEqual({ requestId: "req-1", phone: "[REDACTED]", nested: { accessToken: "[REDACTED]", status: 503 } });
  });

  it("does not log raw arbitrary provider errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logApiError("provider", new Error("provider body contained sensitive detail"), { requestId: "req-2" });
    const logged = String(spy.mock.calls[0][0]);
    expect(logged).toContain('"requestId":"req-2"');
    expect(logged).toContain('"errorCode":"Error"');
    expect(logged).not.toContain("sensitive detail");
  });

  it.each([
    ["relative order", "/order/SECRET_TOKEN", "/order/[REDACTED]"],
    ["absolute order", "https://menuqr.example/order/SECRET_TOKEN", "https://menuqr.example/order/[REDACTED]"],
    ["relative review", "/review/SECRET_TOKEN", "/review/[REDACTED]"],
    ["menu review", "/menu/review/SECRET_TOKEN", "/menu/review/[REDACTED]"],
    ["absolute review", "https://menuqr.example/review/SECRET_TOKEN", "https://menuqr.example/review/[REDACTED]"],
    ["review query", "/r/pizza/review?order=SECRET_TOKEN&locale=en", "/r/pizza/review?order=[REDACTED]&locale=en"],
    ["token query", "https://example.test/callback?token=SECRET_TOKEN&safe=1", "https://example.test/callback?token=[REDACTED]&safe=1"],
  ])("redacts %s capability URLs", (_label, input, expected) => {
    const sanitized = sanitizeLogMetadata({ url: input });
    expect(sanitized.url).toBe(expected);
    expect(JSON.stringify(sanitized)).not.toContain("SECRET_TOKEN");
  });

  it("recursively redacts capability URLs in nested objects and arrays", () => {
    const sanitized = sanitizeLogMetadata({
      metadata: { customerOrderUrl: "/order/SECRET_ONE" },
      links: ["/order/SECRET_TWO", { href: "https://example.test/review/SECRET_THREE" }],
    });
    const output = JSON.stringify(sanitized);
    expect(output).not.toMatch(/SECRET_(?:ONE|TWO|THREE)/);
    expect(sanitized).toEqual({
      metadata: { customerOrderUrl: "/order/[REDACTED]" },
      links: ["/order/[REDACTED]", { href: "https://example.test/review/[REDACTED]" }],
    });
  });

  it("redacts bearer, JWT-like, phone, OTP, and multiple capability values without destroying safe URLs", () => {
    const sanitized = sanitizeLogMetadata({
      safeUrl: "https://example.test/menu/restaurant?locale=en",
      bearer: "Bearer bearer-value",
      jwt: "eyJheader.payload.signature",
      contact: "+201234567890",
      numeric: "123456",
      urls: ["/order/FIRST_TOKEN", "/review/SECOND_TOKEN"],
    });
    expect(sanitized.safeUrl).toBe("https://example.test/menu/restaurant?locale=en");
    const output = JSON.stringify(sanitized);
    for (const secret of ["bearer-value", "eyJheader", "+201234567890", "123456", "FIRST_TOKEN", "SECOND_TOKEN"])
      expect(output).not.toContain(secret);
  });

  it("keeps stable logger diagnostics while removing capability URLs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logApiError("orders", new Error("PROVIDER_FAILURE"), { requestId: "req-3", url: "/order/SECRET_TOKEN", status: 503 });
    const logged = String(spy.mock.calls[0][0]);
    expect(logged).toContain('"context":"orders"');
    expect(logged).toContain('"errorCode":"PROVIDER_FAILURE"');
    expect(logged).toContain('"requestId":"req-3"');
    expect(logged).not.toContain("SECRET_TOKEN");
  });
});
