import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Clock3, MapPin, Phone, Utensils } from "lucide-react";
import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { MenuClient } from "@/components/menu-client";
import { isRestaurantOpen } from "@/lib/restaurant-hours";
import { RestaurantQr } from "@/components/restaurant-qr";
export const revalidate = 60;
const getRestaurant = unstable_cache(
  async (slug: string) =>
    prisma.restaurant.findUnique({
      where: { slug, isActive: true },
      include: {
        settings: true,
        branches: {
          where: { isActive: true },
          include: { workingHours: true },
          take: 1,
        },
        products: {
          where: { isAvailable: true },
          include: {
            category: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1 },
            extras: { where: { isAvailable: true } },
          },
          orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        },
      },
    }),
  ["public-menu"],
  { revalidate: 60, tags: ["public-menu"] },
);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [restaurant, locale] = await Promise.all([
    getRestaurant((await params).slug),
    getLocale(),
  ]);
  if (!restaurant) return {};
  return {
    title: `${locale === "ar" && restaurant.nameAr ? restaurant.nameAr : restaurant.name} | MenuQR`,
    description:
      locale === "ar"
        ? (restaurant.descriptionAr ?? restaurant.description ?? undefined)
        : (restaurant.description ?? undefined),
    openGraph: { images: restaurant.coverUrl ? [restaurant.coverUrl] : [] },
  };
}
export default async function MenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [restaurant, t, qr, locale] = await Promise.all([
    getRestaurant((await params).slug),
    getTranslations("publicMenu"),
    getTranslations("qr"),
    getLocale(),
  ]);
  if (!restaurant) notFound();
  const name =
    locale === "ar" && restaurant.nameAr ? restaurant.nameAr : restaurant.name;
  const branch = restaurant.branches[0];
  const open = branch ? isRestaurantOpen(branch.workingHours) : false;
  const accepting = open && (restaurant.settings?.allowOrdering ?? true);
  const products = restaurant.products.map((product) => ({
    id: product.id,
    name: locale === "ar" && product.nameAr ? product.nameAr : product.name,
    description:
      locale === "ar" && product.descriptionAr
        ? product.descriptionAr
        : (product.description ?? ""),
    price: Number(product.price),
    category:
      locale === "ar" && product.category.nameAr
        ? product.category.nameAr
        : product.category.name,
    image: product.images[0]?.url ?? "",
    featured: product.isFeatured,
    extras: product.extras.map((extra) => ({
      id: extra.id,
      name: locale === "ar" && extra.nameAr ? extra.nameAr : extra.name,
      price: Number(extra.price),
    })),
  }));
  const address = restaurant.address || branch?.address;
  const menuUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/menu/${restaurant.slug}`;
  return (
    <main className="public-menu">
      <header
        className="menu-hero"
        style={
          restaurant.coverUrl
            ? {
                backgroundImage: `linear-gradient(0deg,#13251fe8,#13251f18),url(${restaurant.coverUrl})`,
              }
            : undefined
        }
      >
        <nav>
          <span className="menu-logo">
            {restaurant.logoUrl ? (
              <i
                className="public-logo"
                style={{ backgroundImage: `url(${restaurant.logoUrl})` }}
              />
            ) : (
              <Utensils />
            )}
            {name}
          </span>
          <span className={`open-pill ${accepting ? "" : "closed-pill"}`}>
            {accepting
              ? t("acceptingOrders")
              : open
                ? t("notAcceptingOrders")
                : t("closed")}
          </span>
        </nav>
        <div className="menu-hero-content">
          <div className="menu-hero-copy">
            <p>{t("welcome")}</p>
            <h1>{name}</h1>
            <span>
              {locale === "ar"
                ? (restaurant.descriptionAr ?? restaurant.description)
                : restaurant.description}
            </span>
            <aside>
              {branch && (
                <b>
                  <Clock3 />
                  {open ? t("open") : t("closed")}
                </b>
              )}
              {accepting && (
                <b>
                  <Clock3 />
                  {t("estimated", {
                    minutes: restaurant.settings?.estimatedOrderMinutes ?? 30,
                  })}
                </b>
              )}
              {address &&
                (restaurant.mapUrl ? (
                  <a href={restaurant.mapUrl} target="_blank" rel="noreferrer">
                    <MapPin />
                    {address}
                  </a>
                ) : (
                  <b>
                    <MapPin />
                    {address}
                  </b>
                ))}
              {restaurant.phone && (
                <a href={`tel:${restaurant.phone}`}>
                  <Phone />
                  {restaurant.phone}
                </a>
              )}
              {restaurant.facebookUrl && (
                <a
                  className="social-icon"
                  href={restaurant.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                >
                  <FaFacebookF />
                </a>
              )}
              {restaurant.instagramUrl && (
                <a
                  className="social-icon"
                  href={restaurant.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                >
                  <FaInstagram />
                </a>
              )}
            </aside>
          </div>
          <RestaurantQr
            menuUrl={menuUrl}
            slug={restaurant.slug}
            label={qr("scan")}
          />
        </div>
      </header>
      <section className="menu-content">
        <MenuClient
          restaurant={{
            name,
            slug: restaurant.slug,
            currency: restaurant.currency,
          }}
          products={products}
          orderingEnabled={accepting}
        />
      </section>
      <footer className="menu-footer">{t("powered")}</footer>
    </main>
  );
}
