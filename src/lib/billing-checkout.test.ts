import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createIntent: vi.fn(), failIntent: vi.fn(), createCheckout: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { billingCheckoutIntent: { create: mocks.createIntent, updateMany: mocks.failIntent } } }));
vi.mock("@/lib/lemon-squeezy", () => ({ createLemonCheckout: mocks.createCheckout }));

import { CHECKOUT_INTENT_TTL_MS, startPaidCheckout } from "./billing-checkout";

describe("server-side billing checkout intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIntent.mockImplementation(async ({ data }) => ({ id: "db-id", publicIntentId: data.publicIntentId }));
    mocks.createCheckout.mockResolvedValue("https://checkout.example/secure");
  });

  it("creates a random short-lived intent and sends only its public ID as custom billing identity", async () => {
    const before = Date.now();
    await startPaidCheckout({ restaurantId: "restaurant-a", userId: "owner-a", planId: "plan-a", variantId: "variant-a", email: "owner@example.com" });
    const data = mocks.createIntent.mock.calls[0][0].data;
    expect(data.publicIntentId).toMatch(/^[a-f0-9]{64}$/);
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + CHECKOUT_INTENT_TTL_MS);
    expect(mocks.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ variantId: "variant-a", checkoutIntentId: data.publicIntentId }));
    expect(mocks.createCheckout.mock.calls[0][0]).not.toHaveProperty("restaurantId");
    expect(mocks.createCheckout.mock.calls[0][0]).not.toHaveProperty("planId");
    expect(mocks.createCheckout.mock.calls[0][0]).not.toHaveProperty("userId");
  });

  it("fails the intent when provider checkout creation fails", async () => {
    mocks.createCheckout.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(startPaidCheckout({ restaurantId: "restaurant-a", userId: "owner-a", planId: "plan-a", variantId: "variant-a" })).rejects.toThrow("provider unavailable");
    expect(mocks.failIntent).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "FAILED" } }));
  });
});
