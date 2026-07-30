import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/tenant";
import { BranchForm } from "@/components/branch-form";

export default async function NewBranchPage() {
  await requireTenant();
  const t = await getTranslations("branches");
  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("nav")}</small>
          <h1>{t("add")}</h1>
        </div>
      </header>
      <BranchForm />
    </section>
  );
}
