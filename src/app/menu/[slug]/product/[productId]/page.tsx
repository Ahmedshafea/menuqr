import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FavoriteProductButton } from "@/components/favorite-buttons";
import { getDemoProduct } from "@/lib/demo-restaurants";

export const revalidate = 60;

const getDatabaseProduct = unstable_cache(
  async (slug: string, id: string) =>
    prisma.product.findFirst({
      where: {
        id,
        availability: { not: "HIDDEN" },
        restaurant: { slug, isActive: true },
      },
      include: {
        restaurant: true,
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        extras: { where: { isAvailable: true } },
      },
    }),
  ["public-product"],
  { revalidate: 60, tags: ["public-menu"] },
);

async function getProduct(slug: string, id: string) {
  const demo = getDemoProduct(slug, id);
  if (demo)
    return {
      ...demo.product,
      restaurant: demo.restaurant,
      isDemo: true as const,
    };
  const product = await getDatabaseProduct(slug, id);
  return product ? { ...product, isDemo: false as const } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}): Promise<Metadata> {
  const values = await params;
  const [product, locale] = await Promise.all([
    getProduct(values.slug, values.productId),
    getLocale(),
  ]);
  if (!product) return {};
  return {
    title: locale === "ar" && product.nameAr ? product.nameAr : product.name,
    description:
      locale === "ar"
        ? (product.descriptionAr ?? product.description ?? undefined)
        : (product.description ?? undefined),
    openGraph: { images: product.images.map((image) => image.url) },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const values = await params;
  const [product, t, demoText, locale] = await Promise.all([
    getProduct(values.slug, values.productId),
    getTranslations("productDetails"),
    getTranslations("demo"),
    getLocale(),
  ]);
  if (!product) notFound();
  const name =
    locale === "ar" && product.nameAr ? product.nameAr : product.name;
  const description =
    locale === "ar" && product.descriptionAr
      ? product.descriptionAr
      : product.description;
  const category =
    locale === "ar" && product.category.nameAr
      ? product.category.nameAr
      : product.category.name;
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: product.restaurant.currency,
  });

  return (
    <main className="product-detail-page">
      <div className="product-detail-wrap">
        <Link
          href={`/menu/${product.restaurant.slug}`}
          className="product-back"
        >
          <ArrowLeft />
          {t("back")}
        </Link>
        {product.isDemo && (
          <aside className="demo-notice">
            <b>{demoText("badge")}</b>
            <span>{demoText("note")}</span>
          </aside>
        )}
        <section className="product-detail-card">
          <div className="product-gallery">
            {product.images.length ? (
              product.images.map((image, index) => (
                <div
                  className={
                    index === 0 ? "main-product-image" : "product-thumb"
                  }
                  style={{ backgroundImage: `url(${image.url})` }}
                  key={image.id}
                />
              ))
            ) : (
              <div className="main-product-image empty-image" />
            )}
          </div>
          <div className="product-detail-copy">
            <span className="product-category">{category}</span>
            <h1>{name}</h1>
            <p>{description || t("noDescription")}</p>
            <strong className="product-price">
              {money.format(Number(product.price))}
            </strong>
            {!product.isDemo && (
              <FavoriteProductButton
                productId={product.id}
                slug={product.restaurant.slug}
              />
            )}
            {product.stock !== null && (
              <small>{t("stock", { count: product.stock })}</small>
            )}
            {product.extras.length > 0 && (
              <div className="product-extras">
                <h2>{t("extras")}</h2>
                {product.extras.map((extra) => (
                  <div key={extra.id}>
                    <span>
                      <Check />
                      {locale === "ar" && extra.nameAr
                        ? extra.nameAr
                        : extra.name}
                    </span>
                    <b>+ {money.format(Number(extra.price))}</b>
                  </div>
                ))}
              </div>
            )}
            <Link
              href={`/menu/${product.restaurant.slug}`}
              className="button primary large"
            >
              <Plus />
              {t("addFromMenu")}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
