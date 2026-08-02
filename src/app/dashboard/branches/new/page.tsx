import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { featureLimit } from "@/lib/subscription-plans";
import { BranchForm } from "@/components/branch-form";
import { DashboardFormModal } from "@/components/dashboard-form-modal";

export default async function NewBranchPage() {
  const { restaurantId } = await requireTenant();
  const [limit, count] = await Promise.all([
    featureLimit(restaurantId, "BRANCH_LIMIT"),
    prisma.branch.count({ where: { restaurantId } }),
  ]);
  if (limit !== null && limit >= 0 && count >= limit)
    redirect("/dashboard/subscription?required=BRANCH_LIMIT");
  const t = await getTranslations("branches");
  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("nav")}</small>
          <h1>{t("add")}</h1>
        </div>
      </header>
      <DashboardFormModal title={t("add")} closeHref="/dashboard/branches"><BranchForm /></DashboardFormModal>
    </section>
  );
}
