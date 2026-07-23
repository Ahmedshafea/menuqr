import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseProductImport, productMatchKey } from "@/lib/product-import";
import { revalidateTag } from "next/cache";
import { apiError, logApiError } from "@/lib/api";

export const runtime = "nodejs";

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
    const storageHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
    if (parsed.rows.some(row => row.imageUrl && (!storageHost || new URL(row.imageUrl).hostname !== storageHost))) return apiError("IMAGE_URL_MUST_USE_SUPABASE", 422);
    if (parsed.errors.length)
      return apiError("INVALID_IMPORT_ROWS", 422, parsed.errors.slice(0, 12));
    if (!parsed.rows.length)
      return apiError("EMPTY_IMPORT", 422);
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
