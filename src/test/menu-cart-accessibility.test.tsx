import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    key === "add" ? `Add ${values?.product}` : `${namespace}.${key}`,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/map/LocationField", () => ({ default: () => null }));

import { MenuClient } from "@/components/menu-client";

const props = {
  restaurant: {
    name: "Test",
    slug: "test",
    currency: "EGP",
    estimatedMinutes: 20,
    fulfillment: { delivery: false, pickup: true, dineIn: false },
    pricing: { deliveryFee: 0, deliveryFeeType: "FIXED", serviceFee: 0, serviceFeeType: "FIXED", taxRate: 0, taxType: "EXCLUSIVE" },
  },
  products: [{ id: "p1", name: "Pizza", description: "", price: 10, image: "", category: "Food", available: true, extras: [], optionGroups: [] }],
  branches: [{ id: "b1", name: "Main", slug: "main", address: "Address" }],
  demo: true,
};

describe("public cart accessibility", () => {
  it("names quantity controls and manages cart dialog focus", async () => {
    render(<MenuClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Pizza" }));
    expect(screen.getByRole("button", { name: "Pizza: launchPolish.closed.decrease" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pizza: launchPolish.closed.increase" })).toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: /publicMenu.cart/ });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "publicMenu.yourOrder" });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByRole("button", { name: "common.close" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
