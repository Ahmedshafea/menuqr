import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FavoriteProductButton } from "@/components/favorite-buttons";
import { getDemoProduct } from "@/lib/demo-restaurants";
import { ProductOrderOptions } from "@/components/product-order-options";

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
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: {
            group: {
              include: {
                options: {
                  orderBy: { sortOrder: "asc" },
                  include: { option: true },
                },
              },
            },
          },
        },
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
  const optionGroups = [
    ...(product.extras.length
      ? [
          {
            id: "legacy-extras",
            name: t("extras"),
            required: false,
            min: 0,
            max: product.extras.length,
            options: product.extras.map((extra) => ({
              id: extra.id,
              name:
                locale === "ar" && extra.nameAr ? extra.nameAr : extra.name,
              price: Number(extra.price),
            })),
          },
        ]
      : []),
    ...("optionGroups" in product
      ? product.optionGroups
          .map(({ group }) => ({
            id: group.id,
            name:
              locale === "ar" && group.nameAr ? group.nameAr : group.name,
            required: group.isRequired,
            min: group.isRequired ? Math.max(1, group.minSelections) : 0,
            max: group.isRequired
              ? group.maxSelections
              : group.options.filter(({ option }) => option.isAvailable).length,
            options: group.options
              .filter(({ option }) => option.isAvailable)
              .map(({ option }) => ({
                id: option.id,
                name:
                  locale === "ar" && option.nameAr
                    ? option.nameAr
                    : option.name,
                price: Number(option.priceAdjustment),
              })),
          }))
          .filter((group) => group.options.length > 0)
      : []),
  ];

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
                  className={index === 0 ? "main-product-image" : "product-thumb"}
                  key={image.id}
                >
                  <Image
                    src={image.url}
                    alt={name}
                    fill
                    sizes={index === 0 ? "(max-width: 800px) 100vw, 58vw" : "(max-width: 800px) 25vw, 14vw"}
                  />
                </div>
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
            <ProductOrderOptions
              slug={product.restaurant.slug}
              productId={product.id}
              price={Number(product.price)}
              currency={product.restaurant.currency}
              locale={locale}
              groups={optionGroups}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
