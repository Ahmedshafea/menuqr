import { readSheet } from "read-excel-file/node";

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

const unsupportedSharingHosts = [
  "drive.google.com",
  "docs.google.com",
  "photos.google.com",
  "photos.app.goo.gl",
  "dropbox.com",
  "www.dropbox.com",
  "onedrive.live.com",
  "1drv.ms",
];

export function parseImageUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("image_url must use https");
  const hostname = url.hostname.toLowerCase();
  if (unsupportedSharingHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)))
    throw new Error("image_url uses an unsupported sharing service");
  return url;
}

const text = (value: unknown) => String(value ?? "").trim();
const booleanValue = (value: unknown, fallback: boolean) => {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "y", "نعم", "متاح"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "لا", "مخفي"].includes(normalized)) return false;
  throw new Error("INVALID_BOOLEAN");
};

function csvRows(value: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quoted && character === '"' && value[index + 1] === '"') { field += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") { row.push(field); field = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && value[index + 1] === "\n") index++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new Error("Malformed CSV: unterminated quoted field");
  return rows;
}

export async function parseProductImport(buffer: ArrayBuffer, extension: "xlsx" | "csv") {
  let table: unknown[][];
  if (extension === "csv") table = csvRows(new TextDecoder("utf-8").decode(buffer));
  else table = await readSheet(Buffer.from(buffer)) as unknown[][];
  if (!table.length) throw new Error("The file has no worksheets or rows");
  const headers = table[0].map((value) => text(value).replace(/^\uFEFF/, ""));
  const records = table.slice(1).filter((row) => row.some((value) => text(value))).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])) as Record<string, unknown>);
  if (records.length > 1000) throw new Error("A maximum of 1000 products can be imported at once");

  const errors: { rowNumber: number; reason: string }[] = [];
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
      if (!nameEn && !nameAr) throw new Error("PRODUCT_NAME_REQUIRED");
      if (!categoryEn && !categoryAr) throw new Error("CATEGORY_REQUIRED");
      if (!Number.isFinite(price) || price < 0) throw new Error("INVALID_PRICE");
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error("INVALID_STOCK");
      if (imageUrlText) {
        parseImageUrl(imageUrlText);
      }
      rows.push({
        rowNumber, categoryEn: categoryEn || categoryAr, categoryAr, nameEn: nameEn || nameAr,
        nameAr, descriptionEn: text(record.description_en), descriptionAr: text(record.description_ar),
        price, stock, available: booleanValue(record.available, true), featured: booleanValue(record.featured, false),
        imageUrl: imageUrlText || null,
      });
    } catch (error) { errors.push({ rowNumber, reason: error instanceof Error ? error.message : "INVALID_DATA" }); }
  });
  return { rows, errors };
}

export const productMatchKey = (category: string, product: string) =>
  `${category.trim().toLocaleLowerCase("en-US")}::${product.trim().toLocaleLowerCase("en-US")}`;
