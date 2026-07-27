import { describe, expect, it } from "vitest";
import { assertPdfFile, normalizePdfMenu } from "./pdf-menu-import";

describe("PDF menu import", () => {
  it("merges duplicate categories while preserving item order", () => {
    const menu = normalizePdfMenu({
      categories: [
        { name: "Burgers", items: [{ name: "Classic", description: "", price: 90, currency: "EGP", image: null }] },
        { name: " burgers ", items: [{ name: "Cheese", description: "", price: 105, currency: "EGP", image: null }] },
      ],
    });
    expect(menu.categories).toHaveLength(1);
    expect(menu.categories[0].items.map((item) => item.name)).toEqual(["Classic", "Cheese"]);
  });

  it("rejects content that is not a PDF", () => {
    expect(() => assertPdfFile(
      { size: 5, type: "application/pdf", name: "menu.pdf" },
      new TextEncoder().encode("hello"),
    )).toThrow("CORRUPTED_PDF");
  });
});
