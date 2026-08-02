import { describe, expect, it } from "vitest";
import { checkoutSchema, registerSchema } from "./validators";

describe("registerSchema", () => {
  const valid = { name: "Ahmed Ali", email: "Ahmed@Example.com ", password: "Menuqr123", restaurantName: "Saffron Table", slug: "Saffron Table", whatsapp: "+20 100-000-0000" };

  it("normalizes registration input", () => {
    const result = registerSchema.parse(valid);
    expect(result.email).toBe("ahmed@example.com");
    expect(result.slug).toBe("saffron-table");
    expect(result.whatsapp).toBe("201000000000");
  });

  it("supports Arabic menu slugs", () => {
    expect(registerSchema.parse({ ...valid, slug: "مطعم الزعفران" }).slug).toBe("مطعم-الزعفران");
  });

  it("returns a useful password error", () => {
    const result = registerSchema.safeParse({ ...valid, password: "password" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.password?.[0]).toMatch(/uppercase/);
  });
});

describe("checkoutSchema", () => {
  const order = {
    restaurantSlug: "saffron-table",
    customerName: "Ahmed Ali",
    customerPhone: "01000000000",
    deliveryAddress: "Alexandria, Egypt",
    items: [{
      productId: "product-1",
      name: "Burger",
      price: 100,
      quantity: 1,
      extras: [],
    }],
  };

  it("requires all additional address details for delivery orders", () => {
    const result = checkoutSchema.safeParse(order);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.buildingName).toBeDefined();
      expect(fields.floor).toBeDefined();
      expect(fields.apartment).toBeDefined();
      expect(fields.landmark).toBeDefined();
      expect(fields.deliveryNotes).toBeDefined();
    }
  });

  it("accepts complete delivery details and does not require them for pickup", () => {
    expect(checkoutSchema.safeParse({
      ...order,
      buildingName: "12",
      floor: "3",
      apartment: "8",
      landmark: "Next to the pharmacy",
      deliveryNotes: "Call on arrival",
    }).success).toBe(true);
    expect(checkoutSchema.safeParse({
      ...order,
      fulfillmentType: "PICKUP",
      deliveryAddress: undefined,
    }).success).toBe(true);
  });
});
