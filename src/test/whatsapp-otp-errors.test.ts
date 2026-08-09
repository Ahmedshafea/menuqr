import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ProviderError extends Error {
    constructor(public code: string, public status: number, public retryAfter?: number, public meta?: Record<string, unknown>) { super(code); }
  }
  return { send: vi.fn(), upsert: vi.fn(), remove: vi.fn(), rateLimit: vi.fn(), ProviderError };
});
vi.mock("@/lib/prisma", () => ({ prisma: { whatsAppOtp: { upsert: mocks.upsert, deleteMany: mocks.remove } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, requestIp: () => "trusted-ip" }));
vi.mock("@/lib/otp", () => ({ generateOtp: () => "123456", hashOtp: () => "hash", otpExpiry: () => new Date(Date.now() + 60_000) }));
vi.mock("@/lib/whatsapp", () => ({
  WhatsAppError: mocks.ProviderError,
  normalizeE164: () => "+201000000000",
  getWhatsAppConfigurationStatus: () => ({ accessToken: true, phoneNumberId: true }),
  sendOTP: mocks.send,
}));

import { POST } from "@/app/api/whatsapp/send-otp/route";

const request = () => new Request("http://localhost/api/whatsapp/send-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "+201000000000", language: "en" }) });

describe("public WhatsApp OTP errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.upsert.mockResolvedValue({});
    mocks.remove.mockResolvedValue({ count: 1 });
  });

  it("removes provider diagnostics from public 4xx errors", async () => {
    mocks.send.mockRejectedValue(new mocks.ProviderError("META_PROVIDER_ERROR", 400, undefined, { httpStatus: 400, code: 131000, subcode: 123, message: "sensitive provider diagnostic" }));
    const response = await POST(request());
    const body = await response.text();
    expect(response.status).toBe(502);
    expect(body).toContain("OTP_SEND_FAILED");
    expect(body).not.toMatch(/131000|123|sensitive provider diagnostic|META_PROVIDER_ERROR/);
  });

  it.each([
    new mocks.ProviderError("PROVIDER_500", 500, undefined, { message: "internal provider failure" }),
    new mocks.ProviderError("PROVIDER_TIMEOUT", 504),
    new SyntaxError("malformed provider response"),
    new TypeError("network failure"),
  ])("returns a stable safe error for %#", async (error) => {
    mocks.send.mockRejectedValue(error);
    const response = await POST(request());
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toContain("OTP_SEND_FAILED");
    expect(body).not.toMatch(/PROVIDER_500|PROVIDER_TIMEOUT|internal provider failure|malformed provider response|network failure/);
  });
});
