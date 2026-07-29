import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: (await params).slug },
    select: { name: true, nameAr: true },
  });
  return restaurant
    ? { title: `${restaurant.nameAr || restaurant.name} Reviews | MenuQR` }
    : {};
}

function paginationHref(
  page: number,
  query: { sort?: string; images?: string; q?: string },
) {
  const params = new URLSearchParams();
  if (query.sort && query.sort !== "latest") params.set("sort", query.sort);
  if (query.images === "1") params.set("images", "1");
  if (query.q) params.set("q", query.q);
  if (page > 1) params.set("page", String(page));
  return `?${params.toString()}`;
}

export default async function Reviews({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    sort?: string;
    images?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const [{ slug }, query, locale, t] = await Promise.all([
    params,
    searchParams,
    getLocale(),
    getTranslations("reviews.public"),
  ]);
  const page = Math.max(1, Number(query.page) || 1);
  const take = 12;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      nameAr: true,
      logoUrl: true,
      settings: { select: { reviewsEnabled: true } },
    },
  });
  if (!restaurant?.settings?.reviewsEnabled) notFound();

  const where = {
    restaurantId: restaurant.id,
    status: "PUBLISHED" as const,
    ...(query.images === "1" ? { images: { some: {} } } : {}),
    ...(query.q
      ? {
          comment: {
            contains: query.q.slice(0, 100),
            mode: "insensitive" as const,
          },
        }
      : {}),
  };
  const [reviews, aggregate, distribution, total] = await Promise.all([
    prisma.restaurantReview.findMany({
      where,
      orderBy:
        query.sort === "highest"
          ? [{ overall: "desc" }, { publishedAt: "desc" }]
          : query.sort === "lowest"
            ? [{ overall: "asc" }, { publishedAt: "desc" }]
            : { publishedAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        overall: true,
        comment: true,
        customerName: true,
        isVerified: true,
        ownerReply: true,
        order: { select: { customerName: true } },
        images: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true },
        },
      },
    }),
    prisma.restaurantReview.aggregate({
      where: { restaurantId: restaurant.id, status: "PUBLISHED" },
      _avg: { overall: true },
      _count: { _all: true },
    }),
    prisma.restaurantReview.groupBy({
      by: ["overall"],
      where: { restaurantId: restaurant.id, status: "PUBLISHED" },
      _count: { _all: true },
    }),
    prisma.restaurantReview.count({ where }),
  ]);
  const name =
    locale === "ar" && restaurant.nameAr
      ? restaurant.nameAr
      : restaurant.name;
  const average = aggregate._avg.overall ?? 0;
  const counts = new Map(
    distribution.map((item) => [item.overall, item._count._all]),
  );
  const schema = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name,
    ...(aggregate._count._all
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: average,
            reviewCount: aggregate._count._all,
          },
          review: reviews.map((review) => ({
            "@type": "Review",
            reviewRating: {
              "@type": "Rating",
              ratingValue: review.overall,
              bestRating: 5,
            },
            author: {
              "@type": "Person",
              name:
                review.customerName ||
                review.order?.customerName ||
                t("customer"),
            },
            ...(review.comment ? { reviewBody: review.comment } : {}),
          })),
        }
      : {}),
  };

  return (
    <main className="reviews-public-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <header>
        <Link href={`/menu/${slug}`}>← {t("backToMenu")}</Link>
        {restaurant.logoUrl && (
          <Image
            src={restaurant.logoUrl}
            width={72}
            height={72}
            alt={name}
          />
        )}
        <h1>{name}</h1>
        <strong>★ {average.toFixed(1)}</strong>
        <p>{t("reviews", { count: aggregate._count._all })}</p>
      </header>

      <section className="rating-distribution">
        {[5, 4, 3, 2, 1].map((value) => (
          <div key={value}>
            <span>{"★".repeat(value)}</span>
            <progress
              aria-label={`${value}/5`}
              max={aggregate._count._all || 1}
              value={counts.get(value) || 0}
            />
            <b>{counts.get(value) || 0}</b>
          </div>
        ))}
      </section>

      <form className="review-filters">
        <input
          name="q"
          defaultValue={query.q}
          maxLength={100}
          placeholder={t("search")}
        />
        <select name="sort" defaultValue={query.sort || "latest"}>
          <option value="latest">{t("latest")}</option>
          <option value="highest">{t("highest")}</option>
          <option value="lowest">{t("lowest")}</option>
        </select>
        <label>
          <input
            type="checkbox"
            name="images"
            value="1"
            defaultChecked={query.images === "1"}
          />
          {t("withImages")}
        </label>
        <button className="button ghost" type="submit">{t("apply")}</button>
      </form>

      <section className="public-review-grid">
        {reviews.map((review) => (
          <article key={review.id}>
            <header>
              <b>{"★".repeat(review.overall)}</b>
              {review.isVerified && <span>✓ {t("verified")}</span>}
            </header>
            <p>{review.comment || "—"}</p>
            <small>
              {review.customerName ||
                review.order?.customerName ||
                t("customer")}
            </small>
            {review.images.length > 0 && (
              <div>
                {review.images.map((image) => (
                  <Image
                    key={image.id}
                    src={image.url}
                    alt=""
                    width={180}
                    height={180}
                  />
                ))}
              </div>
            )}
            {review.ownerReply && (
              <blockquote>
                <b>{t("restaurantReply")}</b>
                {review.ownerReply}
              </blockquote>
            )}
          </article>
        ))}
      </section>

      <nav className="pagination">
        {page > 1 ? (
          <Link href={paginationHref(page - 1, query)}>{t("previous")}</Link>
        ) : <span />}
        {page * take < total ? (
          <Link href={paginationHref(page + 1, query)}>{t("next")}</Link>
        ) : <span />}
      </nav>
    </main>
  );
}
