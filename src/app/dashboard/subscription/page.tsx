import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import {
  ensureRestaurantSubscription,
  getPlanCatalog,
} from "@/lib/subscription-plans";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; plan?: string }>;
}) {
  const [{ restaurantId }, query, locale, t, catalog] = await Promise.all([
    requireTenant(),
    searchParams,
    getLocale(),
    getTranslations("subscriptionPlans"),
    getPlanCatalog(),
  ]);
  const subscription = await ensureRestaurantSubscription(restaurantId);
  if (!subscription) throw new Error("SUBSCRIPTION_NOT_AVAILABLE");

  async function changePlan(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const planCode = String(form.get("planCode") || "");
    const plan = await prisma.plan.findFirst({
      where: { code: planCode, isActive: true },
      select: { id: true },
    });
    if (!plan) redirect("/dashboard/subscription");
    const current = await ensureRestaurantSubscription(restaurantId);
    if (current?.planId === plan.id)
      redirect("/dashboard/subscription?result=current");
    await prisma.$transaction(async (transaction) => {
      await transaction.subscription.updateMany({
        where: {
          restaurantId,
          status: { in: ["ACTIVE", "TRIALING"] },
        },
        data: { status: "CANCELLED", endsAt: new Date() },
      });
      await transaction.subscription.create({
        data: {
          restaurantId,
          planId: plan.id,
          status: "ACTIVE",
          startsAt: new Date(),
        },
      });
    });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/subscription");
    revalidateTag("public-menu");
    redirect("/dashboard/subscription?result=changed");
  }

  const currentOrder = subscription.plan.displayOrder;
  const date = (value: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);

  return (
    <section className="dash-main subscription-page">
      <header>
        <div>
          <small>{t("subscription")}</small>
          <h1>{t("manageTitle")}</h1>
          <p>{t("manageDescription")}</p>
        </div>
      </header>

      {query.result === "changed" && <p className="review-result">{t("changed")}</p>}
      {query.result === "current" && <p className="review-result">{t("alreadyCurrent")}</p>}

      <article className="dash-card subscription-summary-card">
        <Crown />
        <div>
          <small>{t("current")}</small>
          <h2>{locale === "ar" && subscription.plan.nameAr ? subscription.plan.nameAr : subscription.plan.name}</h2>
          <p>{t("status")}: {t(`statuses.${subscription.status}`)}</p>
          {subscription.launchPromotion && <b>{t("launchActive")}</b>}
        </div>
        <div>
          <small>{t("expires")}</small>
          <strong>{subscription.endsAt ? date(subscription.endsAt) : t("noExpiry")}</strong>
        </div>
      </article>

      <div className="pricing-plan-grid dashboard-plan-grid">
        {catalog.plans.map((plan) => {
          const isCurrent = plan.id === subscription.planId;
          const isDowngrade = plan.displayOrder < currentOrder;
          const name = locale === "ar" && plan.nameAr ? plan.nameAr : plan.name;
          const description = locale === "ar" && plan.descriptionAr ? plan.descriptionAr : plan.description;
          return (
            <article className={`pricing-plan-card${plan.isRecommended ? " recommended" : ""}${isCurrent ? " current" : ""}`} key={plan.id}>
              <header><div><small>{plan.code}</small><h3>{name}</h3></div>{isCurrent && <span>{t("current")}</span>}</header>
              {catalog.launchPromotion?.affectedPlanId === plan.id && <b className="launch-offer-badge">{t("trialBadge", { days: catalog.launchPromotion.trialDays })}</b>}
              <p>{description}</p>
              <div className="plan-price">{Number(plan.price) === 0 ? <strong>{t("free")}</strong> : <><strong>{new Intl.NumberFormat(locale).format(Number(plan.price))}</strong><span>{t("monthly")}</span></>}</div>
              <ul>{plan.features.map(({ feature, value }) => <li key={feature.id}><Check />{value != null ? t("limitValue", { count: value < 0 ? t("unlimited") : value, feature: locale === "ar" && feature.nameAr ? feature.nameAr : feature.name }) : locale === "ar" && feature.nameAr ? feature.nameAr : feature.name}</li>)}</ul>
              {isCurrent ? <button className="button ghost large" disabled>{t("current")}</button> : <form action={changePlan}><input type="hidden" name="planCode" value={plan.code}/><p className="plan-change-note">{t("confirmChange")}</p><button className={`button ${isDowngrade ? "ghost" : "primary"} large`}>{isDowngrade ? t("downgrade", { plan: name }) : t("changePlan", { plan: name })}</button></form>}
            </article>
          );
        })}
      </div>
      <Link href="/dashboard" className="button ghost subscription-back">← Dashboard</Link>
    </section>
  );
}
