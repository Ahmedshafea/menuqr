import * as XLSX from "xlsx";

export const PRODUCT_IMPORT_COLUMNS = [
  "category_en", "category_ar", "name_en", "name_ar", "description_en",
  "description_ar", "price", "stock", "available", "featured", "image_url",
] as const;

export type ProductImportRow = {
  rowNumber: number;
  categoryEn: string;
  categoryAr: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  price: number;
  stock: number | null;
  available: boolean;
  featured: boolean;
  imageUrl: string | null;
};

const text = (value: unknown) => String(value ?? "").trim();
const booleanValue = (value: unknown, fallback: boolean) => {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "y", "نعم", "متاح"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "لا", "مخفي"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${text(value)}`);
};

export function parseProductImport(buffer: ArrayBuffer, extension: "xlsx" | "csv") {
  const workbook = extension === "csv"
    ? XLSX.read(Buffer.from(buffer), { type: "buffer", codepage: 65001 })
    : XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The file has no worksheets");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "", raw: true });
  if (records.length > 1000) throw new Error("A maximum of 1000 products can be imported at once");

  const errors: string[] = [];
  const rows: ProductImportRow[] = [];
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    try {
      const nameEn = text(record.name_en);
      const nameAr = text(record.name_ar);
      const categoryEn = text(record.category_en);
      const categoryAr = text(record.category_ar);
      const price = Number(record.price);
      const stockText = text(record.stock);
      const stock = stockText === "" ? null : Number(stockText);
      const imageUrlText = text(record.image_url);
      if ((!nameEn && !nameAr) || (!categoryEn && !categoryAr)) throw new Error("name and category are required");
      if (!Number.isFinite(price) || price < 0) throw new Error("price must be zero or greater");
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error("stock must be a positive whole number");
      if (imageUrlText) {
        const url = new URL(imageUrlText);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("image_url must use http or https");
      }
      rows.push({
        rowNumber, categoryEn: categoryEn || categoryAr, categoryAr, nameEn: nameEn || nameAr,
        nameAr, descriptionEn: text(record.description_en), descriptionAr: text(record.description_ar),
        price, stock, available: booleanValue(record.available, true), featured: booleanValue(record.featured, false),
        imageUrl: imageUrlText || null,
      });
    } catch (error) { errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : "invalid data"}`); }
  });
  return { rows, errors };
}

export const productMatchKey = (category: string, product: string) =>
  `${category.trim().toLocaleLowerCase("en-US")}::${product.trim().toLocaleLowerCase("en-US")}`;
