import Link from "next/link"; import { getTranslations } from "next-intl/server";
export default async function NotFound(){const t=await getTranslations("errors");return <main className="auth-main"><div className="auth-box"><h1>{t("notFound")}</h1><p>{t("notFoundText")}</p><Link className="button primary" href="/">{t("back")}</Link></div></main>}
