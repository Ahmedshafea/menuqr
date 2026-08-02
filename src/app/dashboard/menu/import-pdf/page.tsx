import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PdfMenuImporter } from "@/components/pdf-menu-importer";
import { requireTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/subscription-plans";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PdfMenuImportPage() {
  const { restaurantId } = await requireTenant();
  if (!(await hasFeature(restaurantId, "PDF_IMPORT"))) redirect("/dashboard/subscription?required=PDF_IMPORT");
  const t = await getTranslations("pdfImport");
  return <main className="dash-main pdf-import-page">
    <header><div><small>{t("eyebrow")}</small><h1>{t("title")}</h1><p>{t("subtitle")}</p></div><Link className="button ghost" href="/dashboard/menu"><ArrowLeft/>{t("back")}</Link></header>
    <PdfMenuImporter/>
  </main>;
}
