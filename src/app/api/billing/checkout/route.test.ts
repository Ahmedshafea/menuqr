import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  findPlan: vi.fn(),
  startPaidCheckout: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/prisma", () => ({ prisma: { plan: { findFirst: mocks.findPlan } } }));
vi.mock("@/lib/billing-checkout", () => ({ startPaidCheckout: mocks.startPaidCheckout }));
vi.mock("@/lib/api", () => ({ apiError: (code: string, status: number) => Response.json({ code }, { status }), logApiError: vi.fn() }));

import { POST } from "./route";

const request = (planCode = "PRO") => new Request("http://localhost/api/billing/checkout", { method: "POST", body: JSON.stringify({ planCode }) });

describe("paid checkout endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwner.mockResolvedValue({ restaurantId: "restaurant-a", session: { user: { id: "owner-a", email: "owner@example.com", name: "Owner" } } });
    mocks.findPlan.mockResolvedValue({ id: "plan-a", price: 100, lemonSqueezyVariantId: "variant-a" });
    mocks.startPaidCheckout.mockResolvedValue("https://checkout.example/secure");
  });

  it("creates checkout only after owner authorization and server plan resolution", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.startPaidCheckout).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: "restaurant-a", userId: "owner-a", planId: "plan-a", variantId: "variant-a" }));
  });

  it("denies a non-owner before loading a plan", async () => {
    mocks.requireOwner.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(POST(request())).rejects.toThrow("FORBIDDEN");
    expect(mocks.findPlan).not.toHaveBeenCalled();
  });

  it("denies an unknown plan", async () => {
    mocks.findPlan.mockResolvedValueOnce(null);
    expect((await POST(request("UNKNOWN"))).status).toBe(409);
    expect(mocks.startPaidCheckout).not.toHaveBeenCalled();
  });

  it("denies free plans from the paid checkout path", async () => {
    mocks.findPlan.mockResolvedValueOnce({ id: "free", price: 0, lemonSqueezyVariantId: null });
    expect((await POST(request("FREE"))).status).toBe(409);
    expect(mocks.startPaidCheckout).not.toHaveBeenCalled();
  });
});
