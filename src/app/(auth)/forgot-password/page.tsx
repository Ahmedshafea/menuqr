import { getTranslations } from "next-intl/server";
import { PasswordResetForm } from "@/components/password-reset-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string }>;
}) {
  const [t, query] = await Promise.all([getTranslations("security"), searchParams]);
  const audience = query.audience === "customer" ? "customer" : "restaurant";
  return <div className="auth-box"><h1>{t("forgotTitle")}</h1><p>{t("forgotHelp")}</p><PasswordResetForm audience={audience} /></div>;
}
