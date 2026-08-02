import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { PromotionForm, type PromotionDraft } from "@/components/promotion-form";
import { DashboardFormModal } from "@/components/dashboard-form-modal";
import { hasFeature } from "@/lib/subscription-plans";
import { redirect } from "next/navigation";

const dateInput = (value: Date | null) =>
  value ? new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : "";

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ restaurantId }, { id }, locale, t] = await Promise.all([
    requireTenant(),
    params,
    getLocale(),
    getTranslations("promotions.form"),
  ]);
  if (!(await hasFeature(restaurantId, "PROMOTIONS"))) redirect("/dashboard/subscription?required=PROMOTIONS");
  const [promotion, products, categories, branches] = await Promise.all([
    prisma.promotion.findFirst({
      where: { id, restaurantId },
      include: {
        products: { select: { productId: true } },
        categories: { select: { categoryId: true } },
        branches: { select: { branchId: true } },
        coupons: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.product.findMany({ where: { restaurantId }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }),
    prisma.category.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, nameAr: true } }),
    prisma.branch.findMany({ where: { restaurantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!promotion) notFound();
  const initial: PromotionDraft = {
    name: promotion.name,
    nameAr: promotion.nameAr || "",
    description: promotion.description || "",
    descriptionAr: promotion.descriptionAr || "",
    type: promotion.type,
    targetType: promotion.targetType,
    value: String(promotion.value),
    buyQuantity: promotion.buyQuantity ? String(promotion.buyQuantity) : "",
    getQuantity: promotion.getQuantity ? String(promotion.getQuantity) : "",
    freeProductId: promotion.freeProductId || "",
    minimumOrderValue: promotion.minimumOrderValue ? String(promotion.minimumOrderValue) : "",
    maximumDiscount: promotion.maximumDiscount ? String(promotion.maximumDiscount) : "",
    minimumQuantity: promotion.minimumQuantity ? String(promotion.minimumQuantity) : "",
    startsAt: dateInput(promotion.startsAt),
    endsAt: dateInput(promotion.endsAt),
    startTime: promotion.startTime || "",
    endTime: promotion.endTime || "",
    weekdays: promotion.weekdays,
    firstOrderOnly: promotion.firstOrderOnly,
    newCustomersOnly: promotion.newCustomersOnly,
    returningOnly: promotion.returningOnly,
    totalUsageLimit: promotion.totalUsageLimit ? String(promotion.totalUsageLimit) : "",
    perCustomerLimit: promotion.perCustomerLimit ? String(promotion.perCustomerLimit) : "",
    requiresCoupon: promotion.requiresCoupon,
    autoApply: promotion.autoApply,
    allowStacking: promotion.allowStacking,
    stackingRule: promotion.stackingRule,
    priority: String(promotion.priority),
    exclusive: promotion.exclusive,
    isActive: promotion.isActive,
    status: promotion.status,
    productIds: promotion.products.map((item) => item.productId),
    categoryIds: promotion.categories.map((item) => item.categoryId),
    branchIds: promotion.branches.map((item) => item.branchId),
    coupons: promotion.coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description || "",
      maximumUsage: coupon.maximumUsage ? String(coupon.maximumUsage) : "",
      perCustomerLimit: coupon.perCustomerLimit ? String(coupon.perCustomerLimit) : "",
      expiresAt: dateInput(coupon.expiresAt),
      isActive: coupon.isActive,
    })),
  };
  const localize = (item: { id: string; name: string; nameAr?: string | null }) => ({ id: item.id, name: locale === "ar" && item.nameAr ? item.nameAr : item.name });
  return <section className="dash-main"><header><div><h1>{t("editTitle")}</h1></div></header><DashboardFormModal title={t("editTitle")} closeHref="/dashboard/promotions"><PromotionForm promotionId={id} initial={initial} products={products.map(localize)} categories={categories.map(localize)} branches={branches} /></DashboardFormModal></section>;
}
