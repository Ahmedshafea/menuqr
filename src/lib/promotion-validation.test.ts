import { describe, expect, it } from "vitest";
import { promotionInputSchema } from "@/lib/promotion-validation";

const validPromotion = {
  name: "Weekend discount",
  type: "PERCENTAGE",
  targetType: "ORDER",
  value: 10,
  startTime: null,
  endTime: null,
  productIds: [],
  categoryIds: [],
  branchIds: [],
  coupons: [],
};

describe("promotion input validation", () => {
  it("accepts omitted schedule times as null", () => {
    expect(promotionInputSchema.safeParse(validPromotion).success).toBe(true);
  });

  it("identifies empty schedule strings as invalid", () => {
    const result = promotionInputSchema.safeParse({
      ...validPromotion,
      startTime: "",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.flatten().fieldErrors.startTime).toBeDefined();
  });
});
