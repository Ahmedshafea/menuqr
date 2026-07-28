import { beforeAll, describe, expect, it } from "vitest";
import {
  compareOtp,
  createOtpVerificationProof,
  generateOtp,
  hashOtp,
  OTP_LENGTH,
  verifyOtpVerificationProof,
} from "./otp";

describe("WhatsApp OTP", () => {
  beforeAll(() => { process.env.OTP_HASH_SECRET = "test-only-secret-that-is-at-least-32-characters"; });

  it("generates a numeric code with the configured length", () => {
    expect(generateOtp()).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
  });

  it("compares the HMAC without storing the plain code", () => {
    const phone = "+201001234567";
    const code = "123456".slice(0, OTP_LENGTH);
    const hash = hashOtp(phone, code);
    expect(hash).not.toContain(code);
    expect(compareOtp(phone, code, hash)).toBe(true);
    expect(compareOtp(phone, "0".repeat(OTP_LENGTH), hash)).toBe(false);
  });

  it("creates a short-lived proof bound to the verified phone", () => {
    const phone = "+201001234567";
    const proof = createOtpVerificationProof(phone);
    expect(verifyOtpVerificationProof(proof, phone)).toBe(true);
    expect(verifyOtpVerificationProof(proof, "+201009999999")).toBe(false);
    expect(verifyOtpVerificationProof(`${proof}tampered`, phone)).toBe(false);
  });
});
