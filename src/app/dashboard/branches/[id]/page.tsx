import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { BranchForm } from "@/components/branch-form";
import { DashboardFormModal } from "@/components/dashboard-form-modal";

export default async function EditBranchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { restaurantId } = await requireTenant();
  const [t, branch] = await Promise.all([
    getTranslations("branches"),
    prisma.branch.findFirst({
      where: { id: (await params).id, restaurantId },
      include: { workingHours: { orderBy: { dayOfWeek: "asc" } } },
    }),
  ]);
  if (!branch) notFound();
  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("nav")}</small>
          <h1>{t("edit")}</h1>
        </div>
      </header>
      <DashboardFormModal title={t("edit")} closeHref="/dashboard/branches"><BranchForm
        branchId={branch.id}
        initial={{
          name: branch.name,
          slug: branch.slug,
          isActive: branch.isActive,
          phone: branch.phone ?? "",
          whatsappNumber: branch.whatsappNumber ?? "",
          useRestaurantWhatsapp: branch.useRestaurantWhatsapp,
          email: branch.email ?? "",
          address: branch.address,
          city: branch.city ?? "",
          state: branch.state ?? "",
          governorate: branch.governorate ?? branch.state ?? "",
          district: branch.district ?? "",
          area: branch.area ?? "",
          street: branch.street ?? "",
          country: branch.country ?? "",
          postalCode: branch.postalCode ?? "",
          latitude: branch.latitude == null ? null : Number(branch.latitude),
          longitude: branch.longitude == null ? null : Number(branch.longitude),
          googleMapsUrl: branch.googleMapsUrl ?? "",
          workingHours: branch.workingHours,
        }}
      /></DashboardFormModal>
    </section>
  );
}
