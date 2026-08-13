import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthOptions = { callbacks: { jwt: (input: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown> | null> } };
const mocks = vi.hoisted(() => ({ options: null as AuthOptions | null, findUser: vi.fn(), access: vi.fn() }));
vi.mock("next-auth", () => ({ default: (options: AuthOptions) => { mocks.options = options; return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: object) => options }));
vi.mock("bcryptjs", () => ({ compare: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser, findMany: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/otp", () => ({ consumeOtp: vi.fn(), hashOtp: vi.fn(), OTP_LENGTH: 6 }));
vi.mock("@/lib/whatsapp", () => ({ normalizeE164: vi.fn() }));
vi.mock("@/lib/user-access", () => ({ getCachedUserAccess: mocks.access }));
vi.mock("@/lib/rate-limit", () => ({ clearRateLimit: vi.fn(), loginRateLimitKeys: vi.fn(), rateLimit: vi.fn(), requestIp: vi.fn() }));

await import("@/auth");

describe("JWT session-version invalidation", () => {
  beforeEach(() => { mocks.findUser.mockReset(); mocks.access.mockReset(); });

  it("accepts the current version and rejects an old JWT after revocation", async () => {
    mocks.access.mockResolvedValue({ isActive: true, roles: [], restaurantMemberships: [] });
    mocks.findUser.mockResolvedValue({ isActive: true, sessionVersion: 2 });
    await expect(mocks.options!.callbacks.jwt({ token: { sub: "user-a", sessionVersion: 2 } })).resolves.toMatchObject({ sessionVersion: 2 });
    await expect(mocks.options!.callbacks.jwt({ token: { sub: "user-a", sessionVersion: 1 } })).resolves.toBeNull();
  });

  it("binds a freshly authenticated JWT to the server-provided version", async () => {
    await expect(mocks.options!.callbacks.jwt({ token: { sub: "user-a" }, user: { sessionVersion: 4, roles: [], restaurantId: null } }))
      .resolves.toMatchObject({ sessionVersion: 4 });
  });

  it("rejects concurrent requests carrying the same revoked JWT", async () => {
    mocks.findUser.mockResolvedValue({ isActive: true, sessionVersion: 3 });
    const attempts = await Promise.all([
      mocks.options!.callbacks.jwt({ token: { sub: "user-a", sessionVersion: 2 } }),
      mocks.options!.callbacks.jwt({ token: { sub: "user-a", sessionVersion: 2 } }),
    ]);
    expect(attempts).toEqual([null, null]);
  });
});
