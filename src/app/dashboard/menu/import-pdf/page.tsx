import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PdfMenuImporter } from "@/components/pdf-menu-importer";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function PdfMenuImportPage() {
  await requireTenant();
  const t = await getTranslations("pdfImport");
  return <main className="dash-main pdf-import-page">
    <header><div><small>{t("eyebrow")}</small><h1>{t("title")}</h1><p>{t("subtitle")}</p></div><Link className="button ghost" href="/dashboard/menu"><ArrowLeft/>{t("back")}</Link></header>
    <PdfMenuImporter/>
  </main>;
}

