import { describe, expect, it } from "vitest";
import { registerSchema } from "./validators";

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
