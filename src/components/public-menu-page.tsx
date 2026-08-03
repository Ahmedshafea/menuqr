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
import {
  calculatePromotions,
  isPromotionScheduled,
  promotionTargetsLine,
} from "@/lib/promotion-engine";
import { getPromotionCandidates } from "@/lib/promotions";
import { PublicBranchDialog } from "@/components/public-branch-dialog";
import { hasFeature } from "@/lib/subscription-plans";
export const revalidate = 60;
const getDatabaseRestaurant = unstable_cache(
  async (slug: string) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug, isActive: true },
      include: {
        settings: true,
        branches: {
          where: { isActive: true },
          include: { workingHours: true },
          orderBy: { createdAt: "asc" },
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
        reviews:{
          where:{
            status:"PUBLISHED",
            AND:[{comment:{not:null}},{comment:{not:""}}],
          },
          orderBy:{publishedAt:"desc"},
          take:5,
          select:{id:true,overall:true,comment:true,customerName:true,isVerified:true,ownerReply:true,createdAt:true,order:{select:{customerName:true}}},
        },
      },
    });
    if (!restaurant) return null;
    const [rating, promotionCandidates, reviewsAvailable, qrMenuAvailable] = await Promise.all([
      prisma.restaurantReview.aggregate({
        where: { restaurantId: restaurant.id, status: "PUBLISHED" },
        _avg: { overall: true },
        _count: { _all: true },
      }),
      getPromotionCandidates({ restaurantId: restaurant.id }),
      hasFeature(restaurant.id, "REVIEWS"),
      hasFeature(restaurant.id, "QR_MENU"),
    ]);
    if (!qrMenuAvailable) return null;
    return {
      ...restaurant,
      rating: { average: rating._avg.overall ?? 0, count: rating._count._all },
      promotionCandidates,
      reviewsAvailable,
    };
  },
  ["public-menu-with-comment-reviews"],
  { revalidate: 60, tags: ["public-menu"] },
);
export async function getRestaurant(slug: string) {
  return getDemoRestaurant(slug) ?? getDatabaseRestaurant(slug);
}
export async function renderMenuPage({
  restaurantSlug,
  branchSlug,
  searchParams,
  customOrigin,
}: {
  restaurantSlug: string;
  branchSlug?: string;
  searchParams: Promise<{ reorder?: string; extras?: string; checkout?: string }>;
  customOrigin?: string;
}) {
  const [restaurant, t, qr, closedText, experienceText, demoText, locale] = await Promise.all([
    getRestaurant(restaurantSlug),
    getTranslations("publicMenu"),
    getTranslations("qr"),
    getTranslations("launchPolish.closed"),
    getTranslations("mvpPolish.restaurant"),
    getTranslations("demo"),
    getLocale(),
  ]);
  if (!restaurant) notFound();
  const isDemo = "isDemo" in restaurant && restaurant.isDemo;
  const name =
    locale === "ar" && restaurant.nameAr ? restaurant.nameAr : restaurant.name;
  const branch =
    restaurant.branches.find(
      (item) => "slug" in item && item.slug === branchSlug,
    ) ?? (restaurant.branches.length === 1 ? restaurant.branches[0] : undefined);
  if (branchSlug && !branch) notFound();
  const open = branch
    ? isRestaurantOpen(branch.workingHours)
    : restaurant.branches.some((item) =>
        isRestaurantOpen(item.workingHours),
      );
  const closingMinutes = branch ? minutesUntilClosing(branch.workingHours) : null;
  const closingSoon = open && closingMinutes !== null && closingMinutes <= 30;
  const accepting = (restaurant.settings?.allowOrdering ?? true) && (open || (restaurant.settings?.allowOrdersOutsideHours ?? false));
  const todayHours = branch?.workingHours.find((item) => item.dayOfWeek === cairoDayAndTime().day);
  const products = restaurant.products.map((product) => {
    const basePrice = Number(product.price);
    const categoryId =
      "id" in product.category ? product.category.id : product.category.name;
    const visiblePromotion =
      "promotionCandidates" in restaurant
        ? restaurant.promotionCandidates.find(
            (promotion) =>
              promotion.autoApply &&
              !promotion.requiresCoupon &&
              isPromotionScheduled(promotion, new Date(), "Africa/Cairo") &&
              (!promotion.branchIds?.length ||
                Boolean(
                  branch &&
                    "id" in branch &&
                    promotion.branchIds.includes(branch.id),
                )) &&
              promotionTargetsLine(promotion, {
                productId: product.id,
                categoryId,
              }),
          )
        : undefined;
    const productPromotion =
      "promotionCandidates" in restaurant
        ? calculatePromotions(restaurant.promotionCandidates, {
            subtotal: basePrice,
            lines: [{
              productId: product.id,
              categoryId,
              unitPrice: basePrice,
              quantity: 1,
            }],
            fulfillmentType: "PICKUP",
            branchId: branch && "id" in branch ? branch.id : null,
          })
        : null;
    const discountedPrice = productPromotion?.discountAmount
      ? Math.max(0, basePrice - productPromotion.discountAmount)
      : null;
    return {
    id: product.id,
    name: locale === "ar" && product.nameAr ? product.nameAr : product.name,
    description:
      locale === "ar" && product.descriptionAr
        ? product.descriptionAr
        : (product.description ?? ""),
    price: basePrice,
    discountedPrice,
    promotionLabel: productPromotion?.appliedPromotions[0]
      ? locale === "ar" && productPromotion.appliedPromotions[0].nameAr
        ? productPromotion.appliedPromotions[0].nameAr
        : productPromotion.appliedPromotions[0].name
      : visiblePromotion
        ? locale === "ar" && visiblePromotion.nameAr
          ? visiblePromotion.nameAr
          : visiblePromotion.name
        : null,
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
  }});
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
  const address = branch?.address || restaurant.address;
  const menuUrl = customOrigin || `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/menu/${restaurant.slug}${branch && "slug" in branch ? `/${branch.slug}` : ""}`;
  const visibleReviews =
    (isDemo || ("reviewsAvailable" in restaurant && restaurant.reviewsAvailable)) && "reviews" in restaurant
      ? restaurant.reviews
          .filter((review) => Boolean(review.comment?.trim()))
          .slice(0, 5)
      : [];
  const reviewsAvailable =
    isDemo || ("reviewsAvailable" in restaurant && restaurant.reviewsAvailable);
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
            {reviewsAvailable && "rating" in restaurant && restaurant.rating.count > 0 && (
              <a
                className="restaurant-rating-badge"
                href={`/menu/${restaurant.slug}/reviews`}
              >
                <b>{"★".repeat(Math.round(restaurant.rating.average))}</b>
                <strong>{restaurant.rating.average.toFixed(1)}</strong>
                <span>{restaurant.rating.count} {locale === "ar" ? "تقييم" : "reviews"}</span>
              </a>
            )}
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
                ((branch && "latitude" in branch ? branch.latitude : null) != null &&
                (branch && "longitude" in branch ? branch.longitude : null) != null ? (
                  <a href={`https://www.google.com/maps?q=${Number(branch && "latitude" in branch ? branch.latitude : null)},${Number(branch && "longitude" in branch ? branch.longitude : null)}`} target="_blank" rel="noreferrer">
                    <MapPin />
                    {address}
                  </a>
                ) : (
                  <b>
                    <MapPin />
                    {address}
                  </b>
                ))}
              {(branch && "phone" in branch ? branch.phone : null) || restaurant.phone ? (
                <a href={`tel:${(branch && "phone" in branch ? branch.phone : null) || restaurant.phone}`}>
                  <Phone />
                  {(branch && "phone" in branch ? branch.phone : null) || restaurant.phone}
                </a>
              ) : null}
              {"promotionCandidates" in restaurant && (
                <PublicBranchDialog
                  restaurantSlug={restaurant.slug}
                  branches={restaurant.branches.map((item) => ({
                    id: item.id,
                    name: item.name,
                    slug: item.slug,
                    address: item.address,
                    city: item.city,
                    phone: item.phone || restaurant.phone,
                    whatsapp:
                      !item.useRestaurantWhatsapp && item.whatsappNumber
                        ? item.whatsappNumber
                        : restaurant.whatsapp,
                    directions:
                      item.latitude != null && item.longitude != null
                        ? `https://www.google.com/maps?q=${Number(item.latitude)},${Number(item.longitude)}`
                        : item.googleMapsUrl,
                    isOpen: isRestaurantOpen(item.workingHours),
                  }))}
                />
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
        {visibleReviews.length > 0 && (
          <section className="public-reviews wall-of-love">
            <header>
              <div>
                <h2>{locale === "ar" ? "آراء عملائنا" : "Wall of Love"}</h2>
                <p>{locale === "ar" ? "تجارب حقيقية من عملائنا" : "Real customer experiences"}</p>
              </div>
              <a className="button ghost" href={`/menu/${restaurant.slug}/reviews`}>
                {locale === "ar" ? "عرض جميع التقييمات" : "View all reviews"}
              </a>
            </header>
            <div>
              {visibleReviews.map((review) => (
                <article key={review.id}>
                  <b>{"★".repeat(review.overall)}</b>
                  <p>{review.comment}</p>
                  <small>
                    {review.customerName ||
                      review.order?.customerName ||
                      (locale === "ar" ? "عميل" : "Customer")}
                    {review.isVerified &&
                      ` · ${locale === "ar" ? "✓ عميل موثّق" : "✓ Verified customer"}`}
                  </small>
                  {review.ownerReply && <blockquote>{review.ownerReply}</blockquote>}
                </article>
              ))}
            </div>
          </section>
        )}
        <MenuClient
          restaurant={{
            name,
            phone: (branch && "phone" in branch ? branch.phone : null) || restaurant.phone,
            slug: restaurant.slug,
            currency: restaurant.currency,
            estimatedMinutes: restaurant.settings?.estimatedOrderMinutes ?? 30,
            pricing:{deliveryFee:Number(restaurant.settings?.deliveryFee??0),deliveryFeeType:restaurant.settings?.deliveryFeeType??"FIXED",serviceFee:Number(restaurant.settings?.serviceFee??0),serviceFeeType:restaurant.settings?.serviceFeeType??"FIXED",taxRate:Number(restaurant.settings?.taxRate??0),taxType:restaurant.settings?.taxType??"PERCENTAGE"},
            fulfillment:{delivery:restaurant.settings?.offersDelivery??true,pickup:restaurant.settings?.offersPickup??true,dineIn:restaurant.settings?.offersDineIn??false},
          }}
          branches={
            "promotionCandidates" in restaurant
              ? restaurant.branches.map((item) => ({
                  id: item.id,
                  name: item.name,
                  slug: item.slug,
                  address: item.address,
                  city: item.city,
                }))
              : []
          }
          initialBranchId={
            branch && "id" in branch ? branch.id : undefined
          }
          branchLocked={Boolean(branchSlug)}
          products={products}
          promotionBanners={
            "promotionCandidates" in restaurant
              ? restaurant.promotionCandidates
                  .filter(
                    (promotion) =>
                      (promotion.autoApply || promotion.coupons?.length) &&
                      isPromotionScheduled(
                        promotion,
                        new Date(),
                        "Africa/Cairo",
                      ) &&
                      (!promotion.branchIds?.length ||
                        Boolean(
                          branch &&
                            "id" in branch &&
                            promotion.branchIds.includes(branch.id),
                        )),
                  )
                  .slice(0, 3)
                  .map((promotion) => ({
                    id: promotion.id,
                    name:
                      locale === "ar" && promotion.nameAr
                        ? promotion.nameAr
                        : promotion.name,
                    coupon: promotion.coupons?.find((coupon) => coupon.isActive)?.code,
                  }))
              : []
          }
          orderingEnabled={accepting}
          initialCart={initialCart}
          initialSelectedExtras={initialSelectedExtras}
          initialOpen={menuParams.checkout === "1" && Object.keys(initialCart).length > 0}
          customerDefaults={customerDefaults ? { name: customerDefaults.name, phone: customerDefaults.phone ?? "", address: customerDefaults.customerProfile?.addresses[0]?.address ?? "", addresses: (customerDefaults.customerProfile?.addresses ?? []).map((item) => ({ id: item.id, title: item.title, address: item.address, latitude: item.latitude == null ? null : Number(item.latitude), longitude: item.longitude == null ? null : Number(item.longitude), isDefault: item.isDefault })) } : undefined}
          demo={isDemo}
        />
      </section>
      <footer className="menu-footer">{t("powered")}</footer>
    </main>
  );
}
