import { describe, expect, it } from "vitest";
import { branchSchema } from "@/lib/branch-validation";
import { branchWhatsapp } from "@/lib/branches";

const validBranch = {
  name: "Smouha",
  slug: "smouha",
  isActive: true,
  phone: "+2030000000",
  useRestaurantWhatsapp: true,
  address: "Smouha, Alexandria",
  workingHours: [],
};

describe("branch validation", () => {
  it("accepts restaurant WhatsApp routing without a branch number", () => {
    expect(branchSchema.safeParse(validBranch).success).toBe(true);
  });

  it("requires a branch WhatsApp number when restaurant routing is disabled", () => {
    const result = branchSchema.safeParse({
      ...validBranch,
      useRestaurantWhatsapp: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate slugs formats and incomplete coordinates", () => {
    expect(
      branchSchema.safeParse({ ...validBranch, slug: "Smouha Branch" }).success,
    ).toBe(false);
    expect(
      branchSchema.safeParse({ ...validBranch, latitude: 30.1 }).success,
    ).toBe(false);
  });
});

describe("branch WhatsApp routing", () => {
  it("uses the branch number only when explicitly configured", () => {
    expect(
      branchWhatsapp(
        {
          useRestaurantWhatsapp: false,
          whatsappNumber: "+201111111111",
        },
        "+202222222222",
      ),
    ).toBe("+201111111111");
  });

  it("always falls back to the restaurant number", () => {
    expect(
      branchWhatsapp(
        { useRestaurantWhatsapp: false, whatsappNumber: null },
        "+202222222222",
      ),
    ).toBe("+202222222222");
  });
});
