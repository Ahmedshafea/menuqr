import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { uploadRestaurantImage } from "@/lib/supabase/storage";
import { createRestaurantNotification } from "@/lib/restaurant-notifications";
import { ReviewForm } from "@/components/review-form";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const score = (form: FormData, name: string) => {
  const value = Number(form.get(name));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
};

export default async function RestaurantReviewFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string; result?: string }>;
}) {
  const [{ slug }, query, locale, t] = await Promise.all([
    params,
    searchParams,
    getLocale(),
    getTranslations("reviews.public"),
  ]);
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      nameAr: true,
      logoUrl: true,
      locale: true,
      settings: {
        select: {
          reviewsEnabled: true,
          reviewImagesEnabled: true,
          anonymousReviewsEnabled: true,
          requireCompletedOrderForReview: true,
          autoPublishReviews: true,
        },
      },
    },
  });
  if (!restaurant?.settings?.reviewsEnabled) notFound();
  const currentRestaurant = restaurant;
  const arabic = locale === "ar";

  async function submit(form: FormData) {
    "use server";
    const requestHeaders = await headers();
    const ip =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      "unknown";
    if (!rateLimit(`public-review:${currentRestaurant.id}:${ip}`, 3, 60 * 60_000).allowed)
      redirect(`/r/${slug}/review?result=limited`);
    const values = {
      overall: score(form, "overall"),
      foodQuality: score(form, "foodQuality"),
      deliverySpeed: score(form, "deliverySpeed"),
      packaging: score(form, "packaging"),
      staffBehavior: score(form, "staffBehavior"),
    };
    if (Object.values(values).some((value) => value === 0))
      redirect(`/r/${slug}/review?result=invalid`);

    const order = query.order
      ? await prisma.order.findFirst({
          where: {
            accessToken: query.order,
            restaurantId: currentRestaurant.id,
            status: "COMPLETED",
          },
          select: { id: true, customerUserId: true, customerName: true },
        })
      : null;
    if (
      (query.order && !order) ||
      (currentRestaurant.settings?.requireCompletedOrderForReview && !order)
    )
      redirect(`/r/${slug}/review?result=orderRequired`);

    const customerName =
      String(form.get("customerName") || "").trim().slice(0, 80) ||
      order?.customerName ||
      null;
    if (!currentRestaurant.settings?.anonymousReviewsEnabled && !customerName)
      redirect(`/r/${slug}/review?result=nameRequired`);
    const ipHash = createHash("sha256")
      .update(`${process.env.AUTH_SECRET || "menuqr"}:${ip}`)
      .digest("hex");
    if (!order) {
      const duplicate = await prisma.restaurantReview.findFirst({
        where: {
          restaurantId: currentRestaurant.id,
          ipHash,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) },
        },
        select: { id: true },
      });
      if (duplicate) redirect(`/r/${slug}/review?result=duplicate`);
    }

    const files = currentRestaurant.settings?.reviewImagesEnabled
      ? form
          .getAll("images")
          .filter((file): file is File => file instanceof File && file.size > 0)
          .slice(0, 3)
      : [];
    const uploads = await Promise.all(
      files.map((file) =>
        uploadRestaurantImage({
          bucket: "review-images",
          restaurantId: currentRestaurant.id,
          file,
        }),
      ),
    );
    const status = currentRestaurant.settings?.autoPublishReviews
      ? "PUBLISHED"
      : "PENDING";
    await prisma.$transaction(async (tx) => {
      const created = await tx.restaurantReview.create({
        data: {
          restaurantId: currentRestaurant.id,
          orderId: order?.id,
          customerUserId: order?.customerUserId,
          customerName,
          ...values,
          comment:
            String(form.get("comment") || "").trim().slice(0, 1000) || null,
          status,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
          isVerified: Boolean(order),
          ipHash,
          images: {
            create: uploads.map((image, index) => ({
              url: image.url,
              path: image.path,
              sortOrder: index,
            })),
          },
        },
      });
      await createRestaurantNotification(tx, {
        restaurantId: currentRestaurant.id,
        type: values.overall <= 2 ? "LOW_RATING" : "NEW_REVIEW",
        title: values.overall <= 2 ? "Low customer rating" : "New customer review",
        body: `${values.overall}/5`,
        href: "/dashboard/reviews",
        dedupeKey: `review:${created.id}`,
      });
      return created;
    });
    revalidateTag("public-menu");
    revalidatePath(`/menu/${slug}`);
    revalidatePath(`/menu/${slug}/reviews`);
    redirect(`/r/${slug}/review?result=success`);
  }

  return (
    <main className="public-review-page" dir={arabic ? "rtl" : "ltr"}>
      <section className="public-review-card">
        {currentRestaurant.logoUrl && (
          <Image src={currentRestaurant.logoUrl} alt="" width={88} height={88} />
        )}
        <h1>{arabic && currentRestaurant.nameAr ? currentRestaurant.nameAr : currentRestaurant.name}</h1>
        <p>{query.result === "success" ? t("thankYou") : t("helpImprove")}</p>
        {query.result &&
          query.result !== "success" &&
          ["limited", "invalid", "orderRequired", "nameRequired", "duplicate"].includes(
            query.result,
          ) && (
            <p className="review-result is-error" role="alert">
              {t(
                query.result as
                  | "limited"
                  | "invalid"
                  | "orderRequired"
                  | "nameRequired"
                  | "duplicate",
              )}
            </p>
          )}
        {query.result !== "success" && (
          <ReviewForm
            action={submit}
            allowImages={currentRestaurant.settings?.reviewImagesEnabled ?? false}
          />
        )}
      </section>
    </main>
  );
}
