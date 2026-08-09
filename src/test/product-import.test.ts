import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseProductImport, productMatchKey } from "@/lib/product-import";

describe("product import", () => {
  it("parses bilingual CSV rows with typed values", async () => {
    const csv = "category_en,category_ar,name_en,name_ar,price,stock,available,featured,image_url\nDrinks,مشروبات,Coffee,قهوة,45.5,12,true,false,https://example.com/coffee.webp";
    const parsed = await parseProductImport(new TextEncoder().encode(csv).buffer, "csv");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ categoryEn: "Drinks", nameAr: "قهوة", price: 45.5, stock: 12, available: true, featured: false });
  });

  it("parses the maintained Excel import template", async () => {
    const file = await readFile("public/templates/products-import-template.xlsx");
    const parsed = await parseProductImport(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, "xlsx");
    expect(parsed.errors).toEqual([]);
  });

  it("matches product and category names case-insensitively", () => {
    expect(productMatchKey(" Drinks ", "Coffee")).toBe(productMatchKey("drinks", "coffee"));
  });

  it("rejects non-HTTPS and file-sharing image URLs with row details", async () => {
    const csv = "category_en,name_en,price,image_url\nFood,Burger,100,https://drive.google.com/file/d/example";
    const parsed = await parseProductImport(new TextEncoder().encode(csv).buffer, "csv");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0]).toEqual({
      rowNumber: 2,
      reason: "image_url uses an unsupported sharing service",
    });
  });

  it("rejects malformed spreadsheet and CSV input", async () => {
    await expect(parseProductImport(new Uint8Array([1, 2, 3]).buffer, "xlsx")).rejects.toThrow();
    await expect(parseProductImport(new TextEncoder().encode('name_en\n"broken').buffer, "csv")).rejects.toThrow("unterminated");
  });
});
