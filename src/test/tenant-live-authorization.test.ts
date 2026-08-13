import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
  forbidden: vi.fn(() => { throw new Error("FORBIDDEN"); }),
}));

import { requireOwner, requireTenant } from "@/lib/tenant";

const session = (roles = ["STAFF"], restaurantId = "restaurant-a") => ({
  user: { id: "user-a", roles, restaurantId },
});
const identity = (membershipRole: string | null, roles = ["STAFF"], isActive = true) => ({
  isActive,
  sessionVersion: 0,
  roles: roles.map((role) => ({ role })),
  restaurantMemberships: membershipRole ? [{ restaurantId: "restaurant-a", role: membershipRole, restaurant: { isActive: true } }] : [],
});

describe("database-authoritative tenant authorization", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.findUser.mockReset();
    mocks.auth.mockResolvedValue(session());
  });

  it("allows active staff with a current membership", async () => {
    mocks.findUser.mockResolvedValue(identity("STAFF"));
    await expect(requireTenant()).resolves.toMatchObject({ restaurantId: "restaurant-a", membershipRole: "STAFF" });
  });

  it.each([
    ["removed membership", identity(null)],
    ["changed non-tenant role", identity("CUSTOMER", ["CUSTOMER"])],
    ["inactive account", identity("STAFF", ["STAFF"], false)],
  ])("denies a stale session after %s", async (_label, current) => {
    mocks.findUser.mockResolvedValue(current);
    await expect(requireTenant()).rejects.toThrow("FORBIDDEN");
  });

  it("denies membership in a different tenant", async () => {
    mocks.findUser.mockResolvedValue(identity(null));
    await expect(requireTenant()).rejects.toThrow("FORBIDDEN");
    expect(mocks.findUser).toHaveBeenCalledOnce();
  });

  it("preserves current SUPER_ADMIN authorization without a membership", async () => {
    mocks.auth.mockResolvedValue(session(["SUPER_ADMIN"]));
    mocks.findUser.mockResolvedValue(identity(null, ["SUPER_ADMIN"]));
    await expect(requireTenant()).resolves.toMatchObject({ globalRoles: ["SUPER_ADMIN"], membershipRole: null });
  });

  it("allows current owners and denies current staff for owner-only operations", async () => {
    mocks.auth.mockResolvedValue(session(["RESTAURANT_OWNER"]));
    mocks.findUser.mockResolvedValueOnce(identity("RESTAURANT_OWNER", ["RESTAURANT_OWNER"]));
    await expect(requireOwner()).resolves.toMatchObject({ restaurantId: "restaurant-a" });
    mocks.findUser.mockResolvedValueOnce(identity("STAFF", ["STAFF"]));
    await expect(requireOwner()).rejects.toThrow("FORBIDDEN");
  });
});
