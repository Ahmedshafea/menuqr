import { describe, expect, it } from "vitest";
import {
  calculatePromotions,
  type PromotionCandidate,
} from "./promotion-engine";

const base: PromotionCandidate = {
  id: "promo",
  name: "Offer",
  type: "PERCENTAGE",
  targetType: "ORDER",
  value: 10,
  isActive: true,
  status: "ACTIVE",
  autoApply: true,
};
const context = {
  subtotal: 200,
  lines: [
    { productId: "p1", categoryId: "c1", unitPrice: 100, quantity: 2 },
  ],
  fulfillmentType: "DELIVERY" as const,
  now: new Date("2026-07-30T12:00:00Z"),
};

describe("promotion engine", () => {
  it("calculates a percentage discount", () => {
    expect(calculatePromotions([base], context).discountAmount).toBe(20);
  });

  it("caps fixed discounts at the targeted subtotal", () => {
    expect(
      calculatePromotions(
        [{ ...base, type: "FIXED_AMOUNT", value: 500 }],
        context,
      ).discountAmount,
    ).toBe(200);
  });

  it("calculates buy 2 get 1 from eligible cart units", () => {
    const result = calculatePromotions(
      [
        {
          ...base,
          type: "BUY_X_GET_Y",
          buyQuantity: 2,
          getQuantity: 1,
          productIds: ["p1"],
          targetType: "PRODUCT",
        },
      ],
      {
        ...context,
        subtotal: 200,
        lines: [
          { productId: "p1", categoryId: "c1", unitPrice: 100, quantity: 2 },
        ],
      },
    );
    expect(result.discountAmount).toBe(100);
  });

  it("selects the highest non-stackable discount", () => {
    const result = calculatePromotions(
      [
        base,
        { ...base, id: "fixed", type: "FIXED_AMOUNT", value: 30 },
      ],
      context,
    );
    expect(result.appliedPromotions).toHaveLength(1);
    expect(result.discountAmount).toBe(30);
  });

  it("stacks promotions explicitly marked stackable", () => {
    const result = calculatePromotions(
      [
        { ...base, allowStacking: true, stackingRule: "ALLOW" },
        {
          ...base,
          id: "fixed",
          type: "FIXED_AMOUNT",
          value: 30,
          allowStacking: true,
          stackingRule: "ALLOW",
        },
      ],
      context,
    );
    expect(result.appliedPromotions).toHaveLength(2);
    expect(result.discountAmount).toBe(50);
  });

  it("rejects expired coupons", () => {
    const result = calculatePromotions(
      [
        {
          ...base,
          requiresCoupon: true,
          autoApply: false,
          coupons: [
            {
              id: "coupon",
              code: "SAVE10",
              isActive: true,
              expiresAt: "2026-07-01T00:00:00Z",
              usageCount: 0,
            },
          ],
        },
      ],
      { ...context, couponCode: "save10" },
    );
    expect(result.couponError).toBe("COUPON_EXPIRED");
    expect(result.discountAmount).toBe(0);
  });

  it("enforces promotion customer usage limits", () => {
    const result = calculatePromotions(
      [{ ...base, perCustomerLimit: 1, customerUsageCount: 1 }],
      context,
    );
    expect(result.appliedPromotions).toHaveLength(0);
  });

  it("applies free delivery only to delivery orders", () => {
    const promotion = { ...base, type: "FREE_DELIVERY" as const };
    expect(calculatePromotions([promotion], context).freeDelivery).toBe(true);
    expect(
      calculatePromotions(
        [promotion],
        { ...context, fulfillmentType: "PICKUP" },
      ).freeDelivery,
    ).toBe(false);
  });
});
