import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProductImport, productMatchKey } from "@/lib/product-import";

describe("product import", () => {
  it("parses bilingual CSV rows with typed values", () => {
    const csv = "category_en,category_ar,name_en,name_ar,price,stock,available,featured,image_url\nDrinks,مشروبات,Coffee,قهوة,45.5,12,true,false,https://example.com/coffee.webp";
    const parsed = parseProductImport(new TextEncoder().encode(csv).buffer, "csv");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ categoryEn: "Drinks", nameAr: "قهوة", price: 45.5, stock: 12, available: true, featured: false });
  });

  it("parses Excel and reports invalid rows without accepting them", () => {
    const sheet = XLSX.utils.json_to_sheet([{ category_en: "Food", name_en: "Burger", price: -1 }]);
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Products");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parsed = parseProductImport(buffer, "xlsx");
    expect(parsed.rows).toHaveLength(0); expect(parsed.errors[0]).toEqual({ rowNumber: 2, reason: "INVALID_PRICE" });
  });

  it("matches product and category names case-insensitively", () => {
    expect(productMatchKey(" Drinks ", "Coffee")).toBe(productMatchKey("drinks", "coffee"));
  });

  it("rejects non-HTTPS and file-sharing image URLs with row details", () => {
    const csv = "category_en,name_en,price,image_url\nFood,Burger,100,https://drive.google.com/file/d/example";
    const parsed = parseProductImport(new TextEncoder().encode(csv).buffer, "csv");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0]).toEqual({
      rowNumber: 2,
      reason: "image_url uses an unsupported sharing service",
    });
  });
});
