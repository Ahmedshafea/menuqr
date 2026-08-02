import Link from "next/link";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/subscription-plans";

export const dynamic = "force-dynamic";

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    result?: string;
  }>;
}) {
  const [{ restaurantId }, query, locale, t] = await Promise.all([
    requireTenant(),
    searchParams,
    getLocale(),
    getTranslations("promotions"),
  ]);
  if (!(await hasFeature(restaurantId, "PROMOTIONS"))) redirect("/dashboard/subscription?required=PROMOTIONS");
  const page = Math.max(1, Number(query.page) || 1);
  const take = 20;
  const status = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].includes(
    query.status || "",
  )
    ? (query.status as "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED")
    : undefined;
  const where = {
    restaurantId,
    ...(status ? { status } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { nameAr: { contains: query.q, mode: "insensitive" as const } },
            {
              coupons: {
                some: {
                  code: { contains: query.q, mode: "insensitive" as const },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total, stats] = await Promise.all([
    prisma.promotion.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        name: true,
        nameAr: true,
        type: true,
        value: true,
        status: true,
        isActive: true,
        usageCount: true,
        totalUsageLimit: true,
        startsAt: true,
        endsAt: true,
        coupons: { select: { id: true, code: true }, take: 3 },
      },
    }),
    prisma.promotion.count({ where }),
    prisma.promotion.groupBy({
      by: ["status"],
      where: { restaurantId },
      _count: { _all: true },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / take));
  const counts = new Map(stats.map((item) => [item.status, item._count._all]));

  async function toggle(id: string, enabled: boolean) {
    "use server";
    const { restaurantId } = await requireTenant();
    if (!(await hasFeature(restaurantId, "PROMOTIONS")))
      redirect("/dashboard/subscription?required=PROMOTIONS");
    await prisma.promotion.updateMany({
      where: { id, restaurantId, status: { not: "ARCHIVED" } },
      data: {
        isActive: enabled,
        status: enabled ? "ACTIVE" : "PAUSED",
      },
    });
    revalidatePath("/dashboard/promotions");
    revalidateTag("public-menu");
    revalidatePath("/menu", "layout");
  }
  async function remove(id: string) {
    "use server";
    const { restaurantId } = await requireTenant();
    if (!(await hasFeature(restaurantId, "PROMOTIONS")))
      redirect("/dashboard/subscription?required=PROMOTIONS");
    const promotion = await prisma.promotion.findFirst({
      where: { id, restaurantId },
      select: { id: true, _count: { select: { usages: true } } },
    });
    if (!promotion) return;
    if (promotion._count.usages)
      await prisma.promotion.update({
        where: { id },
        data: { status: "ARCHIVED", isActive: false, archivedAt: new Date() },
      });
    else await prisma.promotion.delete({ where: { id } });
    revalidatePath("/dashboard/promotions");
    revalidateTag("public-menu");
    revalidatePath("/menu", "layout");
  }
  async function duplicate(id: string) {
    "use server";
    const { restaurantId } = await requireTenant();
    if (!(await hasFeature(restaurantId, "PROMOTIONS")))
      redirect("/dashboard/subscription?required=PROMOTIONS");
    const source = await prisma.promotion.findFirst({
      where: { id, restaurantId },
      include: {
        products: { select: { productId: true } },
        categories: { select: { categoryId: true } },
        branches: { select: { branchId: true } },
      },
    });
    if (!source) return;
    const copy = await prisma.promotion.create({
      data: {
        restaurantId,
        name: `${source.name} Copy`,
        nameAr: source.nameAr ? `${source.nameAr} - نسخة` : null,
        description: source.description,
        descriptionAr: source.descriptionAr,
        type: source.type,
        targetType: source.targetType,
        value: source.value,
        buyQuantity: source.buyQuantity,
        getQuantity: source.getQuantity,
        freeProductId: source.freeProductId,
        minimumOrderValue: source.minimumOrderValue,
        maximumDiscount: source.maximumDiscount,
        minimumQuantity: source.minimumQuantity,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        startTime: source.startTime,
        endTime: source.endTime,
        weekdays: source.weekdays,
        firstOrderOnly: source.firstOrderOnly,
        newCustomersOnly: source.newCustomersOnly,
        returningOnly: source.returningOnly,
        totalUsageLimit: source.totalUsageLimit,
        perCustomerLimit: source.perCustomerLimit,
        requiresCoupon: source.requiresCoupon,
        autoApply: source.autoApply,
        allowStacking: source.allowStacking,
        stackingRule: source.stackingRule,
        priority: source.priority,
        exclusive: source.exclusive,
        isActive: false,
        status: "DRAFT",
        products: {
          create: source.products.map(({ productId }) => ({ productId })),
        },
        categories: {
          create: source.categories.map(({ categoryId }) => ({ categoryId })),
        },
        branches: {
          create: source.branches.map(({ branchId }) => ({ branchId })),
        },
      },
      select: { id: true },
    });
    redirect(`/dashboard/promotions/${copy.id}`);
  }

  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  return (
    <section className="dash-main promotions-dashboard">
      <header>
        <div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <Link className="button primary" href="/dashboard/promotions/new">
          {t("new")}
        </Link>
      </header>
      {query.result === "saved" && (
        <p className="review-result">{t("form.saved")}</p>
      )}
      <div className="promotion-kpis">
        {(["ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"] as const).map((value) => (
          <article className="dash-card" key={value}>
            <small>{t(value.toLowerCase() as "active" | "draft" | "paused" | "archived")}</small>
            <strong>{counts.get(value) || 0}</strong>
          </article>
        ))}
      </div>
      <form className="management-toolbar">
        <input name="q" defaultValue={query.q} placeholder={t("search")} />
        <select name="status" defaultValue={status || ""}>
          <option value="">{t("allStatuses")}</option>
          <option value="ACTIVE">{t("active")}</option>
          <option value="DRAFT">{t("draft")}</option>
          <option value="PAUSED">{t("paused")}</option>
          <option value="ARCHIVED">{t("archived")}</option>
        </select>
        <button className="button ghost">{t("filter")}</button>
      </form>
      <div className="promotion-list">
        {items.length === 0 && <div className="dash-card">{t("empty")}</div>}
        {items.map((promotion) => (
          <article className="dash-card promotion-card" key={promotion.id}>
            <div>
              <span className={`review-status is-${promotion.status.toLowerCase()}`}>
                {t(promotion.status.toLowerCase() as "active" | "draft" | "paused" | "archived")}
              </span>
              <h2>{locale === "ar" && promotion.nameAr ? promotion.nameAr : promotion.name}</h2>
              <p>{t(`types.${promotion.type}`)}</p>
              {promotion.coupons.length > 0 && (
                <div className="coupon-chips">
                  {promotion.coupons.map((coupon) => <code key={coupon.id}>{coupon.code}</code>)}
                </div>
              )}
            </div>
            <dl>
              <div><dt>{t("value")}</dt><dd>{promotion.type === "PERCENTAGE" ? `${promotion.value}%` : String(promotion.value)}</dd></div>
              <div><dt>{t("usage")}</dt><dd>{promotion.usageCount}/{promotion.totalUsageLimit || "∞"}</dd></div>
              <div><dt>{t("schedule")}</dt><dd>{promotion.startsAt ? format.format(promotion.startsAt) : "—"} · {promotion.endsAt ? format.format(promotion.endsAt) : "∞"}</dd></div>
            </dl>
            <div className="promotion-actions">
              <Link className="button ghost" href={`/dashboard/promotions/${promotion.id}`}>{t("edit")}</Link>
              <form action={duplicate.bind(null, promotion.id)}><button className="button ghost">{t("duplicate")}</button></form>
              {promotion.status !== "ARCHIVED" && <form action={toggle.bind(null, promotion.id, promotion.status !== "ACTIVE")}><button className={promotion.status === "ACTIVE" ? "button ghost" : "button primary"}>{promotion.status === "ACTIVE" ? t("disable") : t("activate")}</button></form>}
              <form action={remove.bind(null, promotion.id)}><button className="button danger">{promotion.usageCount ? t("archive") : t("delete")}</button></form>
            </div>
          </article>
        ))}
      </div>
      {pages > 1 && (
        <nav className="pagination">
          {page > 1 ? <Link href={`?page=${page - 1}`}>←</Link> : <span />}
          <span>{page}/{pages}</span>
          {page < pages ? <Link href={`?page=${page + 1}`}>→</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
