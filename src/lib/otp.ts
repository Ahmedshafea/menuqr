import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

function integerEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export const OTP_LENGTH = integerEnv("OTP_LENGTH", 6, 4, 8);
export const OTP_EXPIRE_MINUTES = integerEnv("OTP_EXPIRE_MINUTES", 5, 1, 30);

function secret() {
  const value = process.env.OTP_HASH_SECRET || process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("OTP_HASH_SECRET_NOT_CONFIGURED");
  return value;
}

export function generateOtp() {
  const limit = 10 ** OTP_LENGTH;
  return randomInt(0, limit).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(phone: string, code: string) {
  return createHmac("sha256", secret()).update(`${phone}:${code}`).digest("hex");
}

export function compareOtp(phone: string, code: string, expectedHash: string) {
  const actual = Buffer.from(hashOtp(phone, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function otpExpiry() {
  return new Date(Date.now() + OTP_EXPIRE_MINUTES * 60_000);
}

export type OtpVerificationResult = "verified" | "invalid" | "expired" | "attempts_exceeded";

export async function consumeOtp(phone: string, code: string): Promise<OtpVerificationResult> {
  const otp = await prisma.whatsAppOtp.findUnique({ where: { phone } });
  if (!otp || otp.verifiedAt) return "invalid";
  if (otp.expiresAt <= new Date()) {
    await prisma.whatsAppOtp.delete({ where: { phone } });
    return "expired";
  }
  if (otp.attempts >= 5) return "attempts_exceeded";
  if (!compareOtp(phone, code, otp.codeHash)) {
    await prisma.whatsAppOtp.update({ where: { phone }, data: { attempts: { increment: 1 } } });
    return "invalid";
  }
  await prisma.whatsAppOtp.update({ where: { phone }, data: { verifiedAt: new Date(), codeHash: "invalidated" } });
  return "verified";
}
