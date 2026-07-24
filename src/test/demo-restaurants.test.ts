import { describe, expect, it } from "vitest";
import {
  demoRestaurantCards,
  getDemoProduct,
  getDemoRestaurant,
  isDemoSlug,
} from "@/lib/demo-restaurants";

describe("demo restaurants", () => {
  it("provides four isolated, populated restaurants", () => {
    expect(demoRestaurantCards).toHaveLength(4);
    expect(new Set(demoRestaurantCards.map((item) => item.slug)).size).toBe(4);
    for (const card of demoRestaurantCards) {
      const restaurant = getDemoRestaurant(card.slug);
      expect(restaurant?.isDemo).toBe(true);
      expect(restaurant?.products.length).toBeGreaterThanOrEqual(8);
      expect(restaurant?.products.every((product) => product.images[0]?.url.startsWith("https://"))).toBe(true);
      expect(isDemoSlug(card.slug)).toBe(true);
    }
  });

  it("resolves demo product routes without database ids", () => {
    const restaurant = getDemoRestaurant("demo-bistro");
    const first = restaurant?.products[0];
    expect(first && getDemoProduct("demo-bistro", first.id)?.product.name).toBe(
      "Classic Burger",
    );
    expect(getDemoProduct("demo-bistro", "missing")).toBeNull();
  });
});
