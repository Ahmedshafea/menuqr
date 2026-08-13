import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  options: null as null | { providers: Array<{ authorize: (raw: unknown, request: Request) => Promise<unknown> }> },
  rateLimit: vi.fn(),
  clearRateLimit: vi.fn(),
  findUser: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (options: typeof mocks.options) => {
    mocks.options = options;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: object) => options }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUser, findMany: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/otp", () => ({ consumeOtp: vi.fn(), hashOtp: vi.fn(() => "hash"), OTP_LENGTH: 6 }));
vi.mock("@/lib/whatsapp", () => ({ normalizeE164: vi.fn((value: string) => value) }));
vi.mock("@/lib/user-access", () => ({ getCachedUserAccess: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  clearRateLimit: mocks.clearRateLimit,
  loginRateLimitKeys: () => ({ client: "client", pair: "pair", account: "account" }),
  rateLimit: mocks.rateLimit,
  requestIp: () => "198.51.100.10",
}));

await import("@/auth");

const result = (allowed: boolean) => ({ allowed, remaining: allowed ? 1 : 0, retryAfter: 3600 });

describe("password authentication rate-limit boundary", () => {
  beforeEach(() => {
    mocks.rateLimit.mockReset();
    mocks.clearRateLimit.mockReset();
    mocks.findUser.mockReset();
    mocks.compare.mockReset();
    mocks.findUser.mockResolvedValue({
      id: "user-a", name: "User", email: "user@example.test", passwordHash: "hash", isActive: true, sessionVersion: 0,
      roles: [{ role: "CUSTOMER" }], restaurantMemberships: [],
    });
    mocks.compare.mockResolvedValue(true);
  });

  async function authorize(denied?: "client" | "pair" | "account") {
    mocks.rateLimit.mockImplementation(async (key: string) => result(key !== denied));
    return mocks.options!.providers[0].authorize(
      { email: "user@example.test", password: "Password1" },
      new Request("https://menuqr.test/api/auth/callback/credentials", { method: "POST" }),
    );
  }

  it.each(["client", "pair", "account"] as const)("rejects before password verification when the %s bucket denies", async (bucket) => {
    await expect(authorize(bucket)).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("continues the normal authentication path only when every bucket allows", async () => {
    await expect(authorize()).resolves.toMatchObject({ id: "user-a" });
    expect(mocks.rateLimit).toHaveBeenCalledTimes(3);
    expect(mocks.findUser).toHaveBeenCalledOnce();
    expect(mocks.compare).toHaveBeenCalledOnce();
  });
});
