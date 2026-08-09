import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ row: null as null | { id: string; phone: string; codeHash: string; expiresAt: Date; verifiedAt: Date | null; attempts: number } }));
vi.mock("@/lib/prisma", () => ({ prisma: { whatsAppOtp: {
  findUnique: vi.fn(async () => db.row ? { ...db.row } : null),
  delete: vi.fn(async () => { db.row = null; }),
  updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: { attempts?: { increment: number }; verifiedAt?: Date; codeHash?: string } }) => {
    const row = db.row;
    if (!row || row.verifiedAt || row.expiresAt <= new Date() || row.attempts >= 5 || (where.id && where.id !== row.id) || (where.codeHash && where.codeHash !== row.codeHash)) return { count: 0 };
    if (data.attempts) row.attempts += data.attempts.increment;
    if (data.verifiedAt) { row.verifiedAt = data.verifiedAt; row.codeHash = data.codeHash || row.codeHash; }
    return { count: 1 };
  }),
} } }));

import { compareOtp, consumeOtp, createOtpVerificationProof, generateOtp, hashOtp, OTP_LENGTH, verifyOtpVerificationProof } from "./otp";

describe("WhatsApp OTP", () => {
  beforeAll(() => { process.env.OTP_HASH_SECRET = "test-only-secret-that-is-at-least-32-characters"; });
  beforeEach(() => { db.row = null; });

  it("generates and compares HMAC-protected codes", () => {
    const code = "123456".slice(0, OTP_LENGTH); const hash = hashOtp("+201001234567", code);
    expect(generateOtp()).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
    expect(hash).not.toContain(code);
    expect(compareOtp("+201001234567", code, hash)).toBe(true);
  });

  it("creates a short-lived proof bound to the phone", () => {
    const proof = createOtpVerificationProof("+201001234567");
    expect(verifyOtpVerificationProof(proof, "+201001234567")).toBe(true);
    expect(verifyOtpVerificationProof(proof, "+201009999999")).toBe(false);
  });

  it("consumes a valid OTP only once, including concurrent attempts", async () => {
    const phone = "+201001234567"; const code = "123456".slice(0, OTP_LENGTH);
    db.row = { id: "otp-1", phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + 60_000), verifiedAt: null, attempts: 0 };
    const results = await Promise.all([consumeOtp(phone, code), consumeOtp(phone, code)]);
    expect(results.filter((result) => result === "verified")).toHaveLength(1);
    expect(await consumeOtp(phone, code)).toBe("invalid");
  });

  it("rejects invalid, expired, and attempt-exhausted OTPs", async () => {
    const phone = "+201001234567"; const code = "123456".slice(0, OTP_LENGTH);
    db.row = { id: "otp-2", phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + 60_000), verifiedAt: null, attempts: 0 };
    expect(await consumeOtp(phone, "0".repeat(OTP_LENGTH))).toBe("invalid");
    db.row!.expiresAt = new Date(Date.now() - 1);
    expect(await consumeOtp(phone, code)).toBe("expired");
    db.row = { id: "otp-3", phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + 60_000), verifiedAt: null, attempts: 5 };
    expect(await consumeOtp(phone, code)).toBe("attempts_exceeded");
  });
});
