import Image from "next/image";
import Link from "next/link";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { applicationUrl } from "@/lib/utils";
import { hasFeature } from "@/lib/subscription-plans";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const reviewStatuses = ["PENDING", "PUBLISHED", "HIDDEN"] as const;
type ReviewStatusFilter = (typeof reviewStatuses)[number];

function pageHref(
  page: number,
  filters: { status?: string; stars?: string },
) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.stars) params.set("stars", filters.stars);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/dashboard/reviews${query ? `?${query}` : ""}`;
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    stars?: string;
    page?: string;
    result?: string;
  }>;
}) {
  const [{ restaurantId }, query, locale, t] = await Promise.all([
    requireTenant(),
    searchParams,
    getLocale(),
    getTranslations("reviews.dashboard"),
  ]);
  if (!(await hasFeature(restaurantId, "REVIEWS"))) redirect("/dashboard/subscription?required=REVIEWS");
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { slug: true },
  });
  const status = reviewStatuses.includes(query.status as ReviewStatusFilter)
    ? (query.status as ReviewStatusFilter)
    : undefined;
  const parsedStars = Number(query.stars);
  const stars =
    Number.isInteger(parsedStars) && parsedStars >= 1 && parsedStars <= 5
      ? parsedStars
      : undefined;
  const requestedPage = Math.max(1, Number(query.page) || 1);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const where = {
    restaurantId,
    ...(status ? { status } : {}),
    ...(stars ? { overall: stars } : {}),
  };

  const [
    total,
    aggregate,
    todayCount,
    weekCount,
    monthCount,
    statusCounts,
    scoreAverages,
  ] = await Promise.all([
    prisma.restaurantReview.count({ where }),
    prisma.restaurantReview.aggregate({
      where: { restaurantId },
      _avg: { overall: true },
      _count: { _all: true },
    }),
    prisma.restaurantReview.count({
      where: { restaurantId, createdAt: { gte: today } },
    }),
    prisma.restaurantReview.count({
      where: { restaurantId, createdAt: { gte: week } },
    }),
    prisma.restaurantReview.count({
      where: { restaurantId, createdAt: { gte: month } },
    }),
    prisma.restaurantReview.groupBy({
      by: ["status"],
      where: { restaurantId },
      _count: { _all: true },
    }),
    prisma.restaurantReview.aggregate({
      where: { restaurantId },
      _avg: {
        foodQuality: true,
        deliverySpeed: true,
        packaging: true,
        staffBehavior: true,
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const reviews = await prisma.restaurantReview.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      foodQuality: true,
      deliverySpeed: true,
      packaging: true,
      staffBehavior: true,
      overall: true,
      comment: true,
      status: true,
      customerName: true,
      isVerified: true,
      ownerReply: true,
      abuseReportedAt: true,
      createdAt: true,
      images: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, url: true },
      },
      order: {
        select: { orderNumber: true, customerName: true },
      },
    },
  });
  const counts = new Map(
    statusCounts.map((item) => [item.status, item._count._all]),
  );

  async function manage(
    id: string,
    action: "reply" | "report" | "PUBLISHED" | "HIDDEN",
    form: FormData,
  ) {
    "use server";
    const { restaurantId: currentRestaurantId } = await requireTenant();
    if (!(await hasFeature(currentRestaurantId, "REVIEWS")))
      redirect("/dashboard/subscription?required=REVIEWS");
    let result = "invalid";
    if (!id) redirect("/dashboard/reviews?result=invalid");

    if (action === "reply") {
      const reply = String(form.get("reply") || "").trim().slice(0, 1000);
      if (reply) {
        const updated = await prisma.restaurantReview.updateMany({
          where: {
            id,
            restaurantId: currentRestaurantId,
            ownerReply: null,
          },
          data: { ownerReply: reply, repliedAt: new Date() },
        });
        if (updated.count) result = "replied";
      }
    } else if (action === "report") {
      const updated = await prisma.restaurantReview.updateMany({
        where: { id, restaurantId: currentRestaurantId },
        data: { abuseReportedAt: new Date(), status: "HIDDEN" },
      });
      if (updated.count) result = "reported";
    } else if (action === "PUBLISHED" || action === "HIDDEN") {
      const updated = await prisma.restaurantReview.updateMany({
        where: { id, restaurantId: currentRestaurantId },
        data: {
          status: action,
          publishedAt: action === "PUBLISHED" ? new Date() : null,
        },
      });
      if (updated.count)
        result = action === "PUBLISHED" ? "published" : "hidden";
    }

    if (result === "invalid") {
      console.error(
        JSON.stringify({
          level: "error",
          context: "review-moderation",
          message: "REVIEW_ACTION_NOT_APPLIED",
          action,
          reviewIdPresent: Boolean(id),
          restaurantIdPresent: Boolean(currentRestaurantId),
        }),
      );
    }
    revalidatePath("/dashboard/reviews");
    revalidatePath(`/menu/${restaurant.slug}`);
    revalidatePath(`/menu/${restaurant.slug}/reviews`);
    revalidateTag("public-menu");
    redirect(`/dashboard/reviews?result=${result}`);
  }

  const resultMessages: Record<string, string> = {
    published: t("updatedPublished"),
    hidden: t("updatedHidden"),
    reported: t("updatedReported"),
    replied: t("updatedReplied"),
    invalid: t("invalidAction"),
  };
  const reviewUrl = `${applicationUrl()}/r/${restaurant.slug}/review`;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="dash-main review-dashboard">
      <header>
        <div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <Link className="button primary" href={reviewUrl} target="_blank">
          {t("openReviewLink")}
        </Link>
      </header>

      {query.result && (
        <p
          className={`review-result ${query.result === "invalid" ? "is-error" : ""}`}
          role="status"
        >
          {resultMessages[query.result] || t("invalidAction")}
        </p>
      )}

      <div className="review-kpis">
        {[
          [t("average"), (aggregate._avg.overall ?? 0).toFixed(1)],
          [t("today"), todayCount],
          [t("thisWeek"), weekCount],
          [t("thisMonth"), monthCount],
          [t("pending"), counts.get("PENDING") || 0],
          [t("published"), counts.get("PUBLISHED") || 0],
        ].map(([label, value]) => (
          <article className="dash-card" key={String(label)}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <section className="dash-card review-score-summary">
        <h2>{t("scoreAverages")}</h2>
        <div>
          <span>{t("food")}: <b>{(scoreAverages._avg.foodQuality ?? 0).toFixed(1)}</b></span>
          <span>{t("delivery")}: <b>{(scoreAverages._avg.deliverySpeed ?? 0).toFixed(1)}</b></span>
          <span>{t("packaging")}: <b>{(scoreAverages._avg.packaging ?? 0).toFixed(1)}</b></span>
          <span>{t("staff")}: <b>{(scoreAverages._avg.staffBehavior ?? 0).toFixed(1)}</b></span>
        </div>
      </section>

      <form className="management-toolbar">
        <select name="status" defaultValue={status || ""} aria-label={t("allStatuses")}>
          <option value="">{t("allStatuses")}</option>
          <option value="PENDING">{t("pending")}</option>
          <option value="PUBLISHED">{t("published")}</option>
          <option value="HIDDEN">{t("hidden")}</option>
        </select>
        <select name="stars" defaultValue={stars || ""} aria-label={t("allRatings")}>
          <option value="">{t("allRatings")}</option>
          {[5, 4, 3, 2, 1].map((value) => (
            <option value={value} key={value}>{value} ★</option>
          ))}
        </select>
        <button className="button ghost" type="submit">{t("filter")}</button>
      </form>

      <div className="review-list">
        {reviews.length === 0 && (
          <section className="dash-card review-empty">{t("noReviews")}</section>
        )}
        {reviews.map((review) => (
          <article className="dash-card review-card" key={review.id}>
            <header>
              <div>
                <b>
                  {review.customerName ||
                    review.order?.customerName ||
                    t("anonymous")}
                </b>
                <small>
                  {review.order?.orderNumber || t("publicReview")}
                  {review.isVerified && ` · ✓ ${t("verified")}`}
                </small>
              </div>
              <div className="review-card-rating">
                <strong aria-label={`${review.overall}/5`}>
                  {"★".repeat(review.overall)}
                  <span>{"★".repeat(5 - review.overall)}</span>
                </strong>
                <em className={`review-status is-${review.status.toLowerCase()}`}>
                  {t(review.status.toLowerCase() as "pending" | "published" | "hidden")}
                </em>
              </div>
            </header>

            <p className="review-comment">{review.comment || "—"}</p>
            <div className="review-sub-scores">
              <span>{t("food")}: <b>{review.foodQuality}</b></span>
              <span>{t("delivery")}: <b>{review.deliverySpeed}</b></span>
              <span>{t("packaging")}: <b>{review.packaging}</b></span>
              <span>{t("staff")}: <b>{review.staffBehavior}</b></span>
            </div>
            <small>{t("createdAt", { date: dateFormatter.format(review.createdAt) })}</small>

            {review.images.length > 0 && (
              <div className="review-admin-images">
                {review.images.map((image) => (
                  <Image
                    key={image.id}
                    src={image.url}
                    alt=""
                    width={96}
                    height={96}
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

            <div className="review-actions">
              <div className="review-moderation-actions">
                {review.status !== "PUBLISHED" && (
                  <form action={manage.bind(null, review.id, "PUBLISHED")}>
                    <button className="button primary" type="submit">
                      {t("publish")}
                    </button>
                  </form>
                )}
                {review.status !== "HIDDEN" && (
                  <form action={manage.bind(null, review.id, "HIDDEN")}>
                    <button className="button ghost" type="submit">
                      {t("hide")}
                    </button>
                  </form>
                )}
                <form action={manage.bind(null, review.id, "report")}>
                  <button
                    className="button danger"
                    type="submit"
                    disabled={Boolean(review.abuseReportedAt)}
                  >
                    {review.abuseReportedAt ? t("reported") : t("report")}
                  </button>
                </form>
              </div>
              {!review.ownerReply && (
                <form
                  action={manage.bind(null, review.id, "reply")}
                  className="review-reply-row"
                >
                  <input
                    name="reply"
                    maxLength={1000}
                    placeholder={t("replyPlaceholder")}
                  />
                  <button
                    className="button ghost"
                    type="submit"
                  >
                    {t("reply")}
                  </button>
                </form>
              )}
            </div>
          </article>
        ))}
      </div>

      {pages > 1 && (
        <nav className="pagination" aria-label={t("page", { page, pages })}>
          {page > 1 ? (
            <Link href={pageHref(page - 1, query)}>{t("previous")}</Link>
          ) : <span />}
          <span>{t("page", { page, pages })}</span>
          {page < pages ? (
            <Link href={pageHref(page + 1, query)}>{t("next")}</Link>
          ) : <span />}
        </nav>
      )}
    </section>
  );
}
