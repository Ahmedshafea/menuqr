import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  consumeOtp: vi.fn(),
  hash: vi.fn(),
  normalizeE164: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  requestIp: () => "198.51.100.10",
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findMany: mocks.findMany, update: mocks.update },
  passwordResetToken: { deleteMany: mocks.deleteMany },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/otp", () => ({ consumeOtp: mocks.consumeOtp, OTP_LENGTH: 6 }));
vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/lib/whatsapp", () => ({ normalizeE164: mocks.normalizeE164 }));

import { POST } from "./route";

const validPayload = {
  phone: "01001234567",
  code: "123456",
  password: "StrongPass1",
  confirmPassword: "StrongPass1",
};

function request(payload: unknown) {
  return new Request("https://menuqr.test/api/password/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function errorCode(response: Response) {
  return (await response.json()).error.code as string;
}

function rejectionReason(info: { mock: { calls: unknown[][] } }) {
  const entry = info.mock.calls.map((call) => {
    const value = call[0];
    try { return JSON.parse(String(value)) as { event?: string; reason?: string }; }
    catch { return {}; }
  }).find((value: { event?: string; reason?: string }) => value.event === "password_reset_rejected");
  return entry?.reason;
}

describe("POST /api/password/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 });
    mocks.normalizeE164.mockReturnValue("+201001234567");
    mocks.findMany.mockResolvedValue([{ id: "user-1" }]);
    mocks.consumeOtp.mockResolvedValue("verified");
    mocks.hash.mockResolvedValue("password-hash");
    mocks.update.mockReturnValue(Promise.resolve({ id: "user-1" }));
    mocks.deleteMany.mockReturnValue(Promise.resolve({ count: 0 }));
    mocks.transaction.mockResolvedValue([]);
  });

  it("accepts a valid payload, reaches OTP verification, and completes the reset", async () => {
    const response = await POST(request(validPayload));
    expect(response.status).toBe(200);
    expect(mocks.consumeOtp).toHaveBeenCalledWith("+201001234567", "123456");
    expect(mocks.hash).toHaveBeenCalledWith("StrongPass1", 12);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({ passwordHash: "password-hash", sessionVersion: { increment: 1 } }),
    }));
  });

  it.each([
    ["missing phone", { ...validPayload, phone: undefined }],
    ["missing OTP", { ...validPayload, code: undefined }],
    ["invalid OTP format", { ...validPayload, code: "12ab56" }],
    ["weak password", { ...validPayload, password: "Short1", confirmPassword: "Short1" }],
    ["missing uppercase", { ...validPayload, password: "lowercase1", confirmPassword: "lowercase1" }],
    ["missing digit", { ...validPayload, password: "NoDigitsHere", confirmPassword: "NoDigitsHere" }],
    ["confirmation mismatch", { ...validPayload, confirmPassword: "Different1" }],
  ])("rejects %s as a privacy-safe schema failure", async (_name, payload) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("INVALID_PASSWORD_RESET");
    expect(rejectionReason(info)).toBe("schema_validation");
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.consumeOtp).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("distinguishes configured OTP-length mismatch internally", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(request({ ...validPayload, code: "12345" }));
    expect(await errorCode(response)).toBe("INVALID_PASSWORD_RESET");
    expect(rejectionReason(info)).toBe("otp_length");
    expect(mocks.consumeOtp).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it.each([
    ["zero", [], "user_match_zero"],
    ["multiple", [{ id: "user-1" }, { id: "user-2" }], "user_match_ambiguous"],
  ])("rejects %s user matches generically before consuming OTP", async (_name, users, reason) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.findMany.mockResolvedValue(users);
    const response = await POST(request(validPayload));
    expect(await errorCode(response)).toBe("INVALID_PASSWORD_RESET");
    expect(rejectionReason(info)).toBe(reason);
    expect(mocks.consumeOtp).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it.each([
    ["invalid", 400, "INVALID_OTP"],
    ["expired", 410, "OTP_EXPIRED"],
    ["attempts_exceeded", 429, "OTP_ATTEMPTS_EXCEEDED"],
  ])("maps OTP result %s without updating the password", async (result, status, code) => {
    mocks.consumeOtp.mockResolvedValue(result);
    const response = await POST(request(validPayload));
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uses one deterministic normalized-phone lookup", async () => {
    await POST(request(validPayload));
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { phone: { in: ["+201001234567", "201001234567"] } },
      take: 2,
      select: { id: true },
    });
  });
});
