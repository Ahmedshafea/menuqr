import { describe, expect, it } from "vitest";
import { calculateOrderPricing } from "@/lib/order-pricing";

describe("order pricing without legacy default discounts", () => {
  const settings = {
    deliveryFee: 20,
    deliveryFeeType: "FIXED",
    serviceFee: 10,
    serviceFeeType: "PERCENTAGE",
    taxRate: 14,
    taxType: "PERCENTAGE",
  };

  it("does not discount an order unless the promotion engine supplies one", () => {
    const pricing = calculateOrderPricing(100, "DELIVERY", settings);

    expect(pricing.discountAmount).toBe(0);
    expect(pricing.discountedSubtotal).toBe(100);
    expect(pricing.total).toBe(148.2);
  });

  it("uses only the discount supplied by the promotion engine", () => {
    const pricing = calculateOrderPricing(100, "DELIVERY", settings, {
      discountAmount: 25,
      freeDelivery: true,
    });

    expect(pricing.promotionDiscountAmount).toBe(25);
    expect(pricing.discountAmount).toBe(25);
    expect(pricing.deliveryFee).toBe(0);
    expect(pricing.total).toBe(94.05);
  });
});
