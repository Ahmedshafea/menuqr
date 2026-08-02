import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { PromotionForm } from "@/components/promotion-form";
import { DashboardFormModal } from "@/components/dashboard-form-modal";
import { hasFeature } from "@/lib/subscription-plans";
import { redirect } from "next/navigation";

export default async function NewPromotionPage() {
  const [{ restaurantId }, locale, t] = await Promise.all([
    requireTenant(),
    getLocale(),
    getTranslations("promotions.form"),
  ]);
  if (!(await hasFeature(restaurantId, "PROMOTIONS"))) redirect("/dashboard/subscription?required=PROMOTIONS");
  const data = await Promise.all([
    prisma.product.findMany({ where: { restaurantId }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }),
    prisma.category.findMany({ where: { restaurantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, nameAr: true } }),
    prisma.branch.findMany({ where: { restaurantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const [products, categories, branches] = data;
  const localize = (item: { id: string; name: string; nameAr?: string | null }) => ({
    id: item.id,
    name: locale === "ar" && item.nameAr ? item.nameAr : item.name,
  });
  return <section className="dash-main"><header><div><h1>{t("createTitle")}</h1></div></header><DashboardFormModal title={t("createTitle")} closeHref="/dashboard/promotions"><PromotionForm products={products.map(localize)} categories={categories.map(localize)} branches={branches} /></DashboardFormModal></section>;
}
