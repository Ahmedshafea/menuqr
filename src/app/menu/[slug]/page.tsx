import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Clock3, MapPin, Phone, Utensils } from "lucide-react";
import { FaFacebookF, FaInstagram } from "react-icons/fa";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { MenuClient } from "@/components/menu-client";
import { cairoDayAndTime, isRestaurantOpen, minutesUntilClosing } from "@/lib/restaurant-hours";
import { RestaurantQr } from "@/components/restaurant-qr";
import { FavoriteRestaurantButton } from "@/components/favorite-buttons";
import { auth } from "@/auth";
import { getDemoRestaurant } from "@/lib/demo-restaurants";
export const revalidate = 60;
const getDatabaseRestaurant = unstable_cache(
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
          where: { availability: { not: "HIDDEN" } },
          include: {
            category: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1 },
            extras: { where: { isAvailable: true } },
            optionGroups: { orderBy: { sortOrder: "asc" }, include: { group: { include: { options: { orderBy: { sortOrder: "asc" }, include: { option: true } } } } } },
          },
          orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        },
        reviews:{where:{status:"PUBLISHED"},orderBy:{publishedAt:"desc"},take:6,select:{id:true,overall:true,comment:true,createdAt:true,order:{select:{customerName:true}}}},
      },
    }),
  ["public-menu"],
  { revalidate: 60, tags: ["public-menu"] },
);
async function getRestaurant(slug: string) {
  return getDemoRestaurant(slug) ?? getDatabaseRestaurant(slug);
}
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reorder?: string; extras?: string; checkout?: string }>;
}) {
  const [restaurant, t, qr, closedText, experienceText, demoText, reviewsText, locale] = await Promise.all([
    getRestaurant((await params).slug),
    getTranslations("publicMenu"),
    getTranslations("qr"),
    getTranslations("launchPolish.closed"),
    getTranslations("mvpPolish.restaurant"),
    getTranslations("demo"),
    getTranslations("restaurantWorkflow.reviews"),
    getLocale(),
  ]);
  if (!restaurant) notFound();
  const isDemo = "isDemo" in restaurant && restaurant.isDemo;
  const name =
    locale === "ar" && restaurant.nameAr ? restaurant.nameAr : restaurant.name;
  const branch = restaurant.branches[0];
  const open = branch ? isRestaurantOpen(branch.workingHours) : false;
  const closingMinutes = branch ? minutesUntilClosing(branch.workingHours) : null;
  const closingSoon = open && closingMinutes !== null && closingMinutes <= 30;
  const accepting = (restaurant.settings?.allowOrdering ?? true) && (open || (restaurant.settings?.allowOrdersOutsideHours ?? false));
  const todayHours = branch?.workingHours.find((item) => item.dayOfWeek === cairoDayAndTime().day);
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
    available: product.availability === "AVAILABLE",
    extras: [...product.extras.map((extra) => ({
      id: extra.id,
      name: locale === "ar" && extra.nameAr ? extra.nameAr : extra.name,
      price: Number(extra.price),
    })), ...("optionGroups" in product ? product.optionGroups.flatMap(({group})=>group.options.filter(({option})=>option.isAvailable).map(({option})=>({id:option.id,name:locale==="ar"&&option.nameAr?option.nameAr:option.name,price:Number(option.priceAdjustment)}))) : [])],
    optionGroups: "optionGroups" in product ? product.optionGroups.map(({group})=>{const options=group.options.filter(({option})=>option.isAvailable).map(({option})=>({id:option.id,name:locale==="ar"&&option.nameAr?option.nameAr:option.name,price:Number(option.priceAdjustment)}));return{id:group.id,name:locale==="ar"&&group.nameAr?group.nameAr:group.name,required:group.isRequired,min:group.isRequired?Math.max(1,group.minSelections):0,max:group.isRequired?group.maxSelections:options.length,options}}).filter((group)=>group.options.length>0) : [],
  }));
  const menuParams = await searchParams;
  const reorder = menuParams.reorder ?? "";
  const availableIds = new Set(products.filter((product) => product.available).map((product) => product.id));
  const initialCart = Object.fromEntries(reorder.split(",").map((part) => part.split(":" as const)).filter(([id,quantity]) => availableIds.has(id) && Number.isInteger(Number(quantity)) && Number(quantity) > 0).map(([id,quantity]) => [id, Math.min(99, Number(quantity))]));
  const requestedExtras = new Set((menuParams.extras ?? "").split(",").filter(Boolean));
  const initialSelectedExtras = Object.fromEntries(
    products
      .filter((product) => initialCart[product.id])
      .map((product) => [
        product.id,
        product.extras
          .filter((extra) => requestedExtras.has(extra.id))
          .map((extra) => extra.id),
      ]),
  );
  const session = await auth();
  const customerDefaults = !isDemo && session?.user.roles.includes("CUSTOMER") ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, phone: true, customerProfile: { select: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], select: { id: true, title: true, address: true, latitude: true, longitude: true, isDefault: true } } } } } }) : null;
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
          <span className={`restaurant-live-status ${open ? (closingSoon ? "closing" : "open") : "closed"}`}>
            {open ? (closingSoon ? experienceText("closingSoon") : experienceText("open")) : experienceText("closed")}
          </span>
          {!isDemo && <FavoriteRestaurantButton restaurantId={restaurant.id} slug={restaurant.slug} />}
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
              <b>
                <Clock3 />
                {experienceText("estimated", { minutes: restaurant.settings?.estimatedOrderMinutes ?? 30 })}
              </b>
              {address &&
                (restaurant.latitude != null && restaurant.longitude != null ? (
                  <a href={`https://www.google.com/maps?q=${Number(restaurant.latitude)},${Number(restaurant.longitude)}`} target="_blank" rel="noreferrer">
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
        {isDemo && <aside className="demo-notice"><b>{demoText("badge")}</b><span>{demoText("note")}</span></aside>}
        {closingSoon && <aside className="closing-soon-notice">{experienceText("closingWarning")}</aside>}
        {!accepting && (
          <aside className="closed-order-notice">
            <Clock3 />
            <div>
              <h2>{closedText("title")}</h2>
              <p>{todayHours && !todayHours.isClosed && todayHours.opensAt && todayHours.closesAt ? closedText("hours", { hours: `${todayHours.opensAt} – ${todayHours.closesAt}` }) : closedText("noHours")}</p>
              <small>{closedText("help")}</small>
            </div>
          </aside>
        )}
        <MenuClient
          restaurant={{
            name,
            phone: restaurant.phone,
            slug: restaurant.slug,
            currency: restaurant.currency,
            estimatedMinutes: restaurant.settings?.estimatedOrderMinutes ?? 30,
            pricing:{deliveryFee:Number(restaurant.settings?.deliveryFee??0),deliveryFeeType:restaurant.settings?.deliveryFeeType??"FIXED",serviceFee:Number(restaurant.settings?.serviceFee??0),serviceFeeType:restaurant.settings?.serviceFeeType??"FIXED",taxRate:Number(restaurant.settings?.taxRate??0),taxType:restaurant.settings?.taxType??"PERCENTAGE",discountValue:Number(restaurant.settings?.discountValue??0),discountType:restaurant.settings?.discountType??"FIXED"},
            fulfillment:{delivery:restaurant.settings?.offersDelivery??true,pickup:restaurant.settings?.offersPickup??true,dineIn:restaurant.settings?.offersDineIn??false},
          }}
          products={products}
          orderingEnabled={accepting}
          initialCart={initialCart}
          initialSelectedExtras={initialSelectedExtras}
          initialOpen={menuParams.checkout === "1" && Object.keys(initialCart).length > 0}
          customerDefaults={customerDefaults ? { name: customerDefaults.name, phone: customerDefaults.phone ?? "", address: customerDefaults.customerProfile?.addresses[0]?.address ?? "", addresses: (customerDefaults.customerProfile?.addresses ?? []).map((item) => ({ id: item.id, title: item.title, address: item.address, latitude: item.latitude == null ? null : Number(item.latitude), longitude: item.longitude == null ? null : Number(item.longitude), isDefault: item.isDefault })) } : undefined}
          demo={isDemo}
        />
        {"reviews" in restaurant&&restaurant.reviews.length>0&&<section className="public-reviews"><header><h2>{reviewsText("latest")}</h2><strong>★ {(restaurant.reviews.reduce((sum,review)=>sum+review.overall,0)/restaurant.reviews.length).toFixed(1)} · {reviewsText("count",{count:restaurant.reviews.length})}</strong></header><div>{restaurant.reviews.map(review=><article key={review.id}><b>{"★".repeat(review.overall)}</b><p>{review.comment}</p><small>{review.order.customerName}</small></article>)}</div></section>}
      </section>
      <footer className="menu-footer">{t("powered")}</footer>
    </main>
  );
}
