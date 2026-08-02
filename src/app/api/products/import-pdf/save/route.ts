import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { apiError, logApiError } from "@/lib/api";
import { normalizePdfMenu, pdfMenuSchema } from "@/lib/pdf-menu-import";
import { prisma } from "@/lib/prisma";
import { productMatchKey } from "@/lib/product-import";
import { featureLimit, hasFeature } from "@/lib/subscription-plans";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const restaurantId = session?.user.restaurantId;
  if (!restaurantId || !session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    return apiError("UNAUTHORIZED", 401);
  if (!(await hasFeature(restaurantId, "PDF_IMPORT"))) return apiError("FEATURE_NOT_AVAILABLE", 403);
  const parsed = pdfMenuSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_IMPORT_DATA", 422, parsed.error.flatten());
  try {
    const menu = normalizePdfMenu(parsed.data);
    const [existingCategories, existingProducts] = await Promise.all([
      prisma.category.findMany({ where: { restaurantId }, select: { id: true, name: true, nameAr: true, sortOrder: true } }),
      prisma.product.findMany({ where: { restaurantId }, select: { name: true, nameAr: true, category: { select: { name: true, nameAr: true } } } }),
    ]);
    const categoryMap = new Map(existingCategories.flatMap((category) =>
      [category.name, category.nameAr].filter(Boolean).map((name) => [name!.trim().toLocaleLowerCase(), category.id] as const)));
    const productKeys = new Set(existingProducts.flatMap((product) => {
      const keys = [productMatchKey(product.category.name, product.name)];
      if (product.category.nameAr && product.nameAr) keys.push(productMatchKey(product.category.nameAr, product.nameAr));
      return keys;
    }));
    const incomingKeys = new Set(productKeys);
    let newProductCount = 0;
    for (const category of menu.categories) {
      for (const item of category.items) {
        const key = productMatchKey(category.name, item.name);
        if (!incomingKeys.has(key)) {
          incomingKeys.add(key);
          newProductCount++;
        }
      }
    }
    const productLimit = await featureLimit(restaurantId, "PRODUCT_LIMIT");
    if (productLimit !== null && productLimit >= 0 && existingProducts.length + newProductCount > productLimit)
      return apiError("PLAN_PRODUCT_LIMIT", 403, { limit: productLimit });
    let createdCategories = 0;
    let createdProducts = 0;
    let skippedProducts = 0;
    await prisma.$transaction(async (tx) => {
      for (const [categoryIndex, category] of menu.categories.entries()) {
        const categoryKey = category.name.toLocaleLowerCase();
        let categoryId = categoryMap.get(categoryKey);
        if (!categoryId) {
          const created = await tx.category.create({
            data: { restaurantId, name: category.name, sortOrder: existingCategories.length + categoryIndex },
            select: { id: true },
          });
          categoryId = created.id;
          categoryMap.set(categoryKey, categoryId);
          createdCategories++;
        }
        let itemOrder = 0;
        for (const item of category.items) {
          const key = productMatchKey(category.name, item.name);
          if (productKeys.has(key)) { skippedProducts++; continue; }
          await tx.product.create({
            data: {
              restaurantId,
              categoryId,
              name: item.name,
              description: item.description || null,
              price: item.price,
              sortOrder: itemOrder++,
              availability: "AVAILABLE",
              isAvailable: true,
              ...(item.image ? { images: { create: { url: item.image, alt: item.name } } } : {}),
            },
          });
          productKeys.add(key);
          createdProducts++;
        }
      }
    }, { timeout: 30_000 });
    revalidateTag("public-menu");
    return Response.json({ createdCategories, createdProducts, skippedProducts });
  } catch (error) {
    logApiError("pdf-menu-save", error, { restaurantId });
    return apiError("PDF_IMPORT_SAVE_FAILED", 500);
  }
}
