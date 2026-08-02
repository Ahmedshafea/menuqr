import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseImageUrl, parseProductImport, productMatchKey, type ProductImportRow } from "@/lib/product-import";
import { revalidateTag } from "next/cache";
import { apiError, logApiError } from "@/lib/api";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { featureLimit } from "@/lib/subscription-plans";

export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function privateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function validateImage(row: ProductImportRow) {
  if (!row.imageUrl) return null;
  try {
    let url = parseImageUrl(row.imageUrl);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("private_host");
      const addresses = await lookup(url.hostname, { all: true });
      if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("private_host");
      const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(6000), headers: { accept: "image/avif,image/webp,image/png,image/jpeg" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) return { rowNumber: row.rowNumber, reason: "UNSUPPORTED_IMAGE_URL" };
        url = parseImageUrl(new URL(location, url).toString());
        continue;
      }
      const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      const size = Number(response.headers.get("content-length") || 0);
      if (!response.ok || !type || !IMAGE_TYPES.has(type)) return { rowNumber: row.rowNumber, reason: "NOT_DIRECT_IMAGE" };
      if (size > MAX_IMAGE_BYTES) return { rowNumber: row.rowNumber, reason: "IMAGE_TOO_LARGE" };
      return null;
    }
    return { rowNumber: row.rowNumber, reason: "UNSUPPORTED_IMAGE_URL" };
  } catch {
    return { rowNumber: row.rowNumber, reason: "UNSUPPORTED_IMAGE_URL" };
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const restaurantId = session?.user?.restaurantId;
  if (!restaurantId || !session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    return apiError("UNAUTHORIZED", 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return apiError("INVALID_IMPORT_FILE", 400);
  if (file.size > 5 * 1024 * 1024)
    return apiError("FILE_TOO_LARGE", 400);
  const extension = file.name.toLowerCase().endsWith(".csv")
    ? "csv"
    : file.name.toLowerCase().endsWith(".xlsx")
      ? "xlsx"
      : null;
  if (!extension)
    return apiError("UNSUPPORTED_FILE", 400);
  try {
    const parsed = parseProductImport(await file.arrayBuffer(), extension);
    if (parsed.errors.length)
      return apiError("INVALID_IMPORT_ROWS", 422, parsed.errors.slice(0, 12));
    if (!parsed.rows.length)
      return apiError("EMPTY_IMPORT", 422);
    const imageErrors: { rowNumber: number; reason: string }[] = [];
    for (let index = 0; index < parsed.rows.length; index += 8) {
      const batch = await Promise.all(parsed.rows.slice(index, index + 8).map(validateImage));
      imageErrors.push(...batch.filter((error): error is { rowNumber: number; reason: string } => Boolean(error)));
      if (imageErrors.length >= 12) break;
    }
    if (imageErrors.length) return apiError("INVALID_IMAGE_URLS", 422, imageErrors.slice(0, 12));
    const [categories, products] = await Promise.all([
      prisma.category.findMany({
        where: { restaurantId },
        select: { id: true, name: true, nameAr: true },
      }),
      prisma.product.findMany({
        where: { restaurantId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          category: { select: { name: true, nameAr: true } },
        },
      }),
    ]);
    const categoryMap = new Map<string, string>();
    categories.forEach((category) => {
      categoryMap.set(category.name.trim().toLowerCase(), category.id);
      if (category.nameAr)
        categoryMap.set(category.nameAr.trim().toLowerCase(), category.id);
    });
    const productMap = new Map<string, string>();
    products.forEach((product) => {
      productMap.set(
        productMatchKey(product.category.name, product.name),
        product.id,
      );
      if (product.category.nameAr && product.nameAr)
        productMap.set(
          productMatchKey(product.category.nameAr, product.nameAr),
          product.id,
        );
    });
    const importKeys = new Set(productMap.keys());
    let newProductCount = 0;
    for (const row of parsed.rows) {
      const key = productMatchKey(row.categoryEn, row.nameEn);
      if (!importKeys.has(key)) {
        importKeys.add(key);
        newProductCount++;
      }
    }
    const productLimit = await featureLimit(restaurantId, "PRODUCT_LIMIT");
    if (productLimit !== null && productLimit >= 0 && products.length + newProductCount > productLimit)
      return apiError("PLAN_PRODUCT_LIMIT", 403, { limit: productLimit });
    let created = 0;
    let updated = 0;
    await prisma.$transaction(
      async (tx) => {
        for (const row of parsed.rows) {
          const categoryKey = row.categoryEn.toLowerCase();
          let categoryId =
            categoryMap.get(categoryKey) ||
            (row.categoryAr
              ? categoryMap.get(row.categoryAr.toLowerCase())
              : undefined);
          if (!categoryId) {
            const category = await tx.category.create({
              data: {
                restaurantId,
                name: row.categoryEn,
                nameAr: row.categoryAr || null,
                sortOrder: categoryMap.size,
              },
            });
            categoryId = category.id;
            categoryMap.set(categoryKey, categoryId);
            if (row.categoryAr)
              categoryMap.set(row.categoryAr.toLowerCase(), categoryId);
          }
          const productId =
            productMap.get(productMatchKey(row.categoryEn, row.nameEn)) ||
            (row.categoryAr && row.nameAr
              ? productMap.get(productMatchKey(row.categoryAr, row.nameAr))
              : undefined);
          const data = {
            categoryId,
            name: row.nameEn,
            nameAr: row.nameAr || null,
            description: row.descriptionEn || null,
            descriptionAr: row.descriptionAr || null,
            price: row.price,
            stock: row.stock,
            isAvailable: row.available,
            availability: row.available ? ("AVAILABLE" as const) : ("HIDDEN" as const),
            isFeatured: row.featured,
          };
          if (productId) {
            await tx.product.update({
              where: { id: productId },
              data: {
                ...data,
                ...(row.imageUrl
                  ? {
                      images: {
                        deleteMany: {},
                        create: { url: row.imageUrl, alt: row.nameEn },
                      },
                    }
                  : {}),
              },
            });
            updated++;
          } else {
            const product = await tx.product.create({
              data: {
                restaurantId,
                ...data,
                ...(row.imageUrl
                  ? {
                      images: {
                        create: { url: row.imageUrl, alt: row.nameEn },
                      },
                    }
                  : {}),
              },
            });
            productMap.set(
              productMatchKey(row.categoryEn, row.nameEn),
              product.id,
            );
            created++;
          }
        }
      },
      { timeout: 30000 },
    );
    revalidateTag("public-menu");
    return Response.json({ created, updated });
  } catch (error) {
    logApiError("product-import", error, { restaurantId }); return apiError("IMPORT_FAILED", 400);
  }
}
