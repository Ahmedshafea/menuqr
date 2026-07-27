import { z } from "zod";

export const MAX_PDF_MENU_BYTES = 20 * 1024 * 1024;
export const PDF_IMPORT_BUCKET = "menu-imports";

export const pdfMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  price: z.coerce.number().finite().nonnegative().max(1_000_000),
  currency: z.string().trim().max(12).default(""),
  image: z.string().url().nullable().default(null),
});

export const pdfMenuCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(pdfMenuItemSchema).max(500),
});

export const pdfMenuSchema = z.object({
  categories: z.array(pdfMenuCategorySchema).min(1).max(100),
}).superRefine((menu, context) => {
  const count = menu.categories.reduce((sum, category) => sum + category.items.length, 0);
  if (!count) context.addIssue({ code: "custom", message: "The menu contains no products" });
  if (count > 1000) context.addIssue({ code: "custom", message: "A maximum of 1000 products can be imported" });
});

export type PdfMenuImport = z.infer<typeof pdfMenuSchema>;

export function assertPdfFile(file: { size: number; type?: string; name?: string }, bytes?: Uint8Array) {
  if (!file.size) throw new Error("EMPTY_PDF");
  if (file.size > MAX_PDF_MENU_BYTES) throw new Error("PDF_TOO_LARGE");
  if (file.type && file.type !== "application/pdf") throw new Error("UNSUPPORTED_PDF");
  if (file.name && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("UNSUPPORTED_PDF");
  if (bytes && new TextDecoder("ascii").decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("CORRUPTED_PDF");
}

export function normalizePdfMenu(input: unknown): PdfMenuImport {
  const parsed = pdfMenuSchema.parse(input);
  const categories = new Map<string, PdfMenuImport["categories"][number]>();
  for (const category of parsed.categories) {
    const key = category.name.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    const current = categories.get(key);
    if (current) current.items.push(...category.items);
    else categories.set(key, { ...category, items: [...category.items] });
  }
  return pdfMenuSchema.parse({ categories: [...categories.values()] });
}

