import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";

export default async function CustomerLoginPage() {
  const t = await getTranslations("auth");

  return (
    <div className="auth-box">
      <h1>{t("customerWelcome")}</h1>
      <p>{t("customerLoginSubtitle")}</p>
      <AuthForm mode="login" redirectTo="/account" />
      <div className="auth-bottom">
        {t("restaurantOwner")}{" "}
        <Link href="/login">{t("restaurantLogin")}</Link>
      </div>
    </div>
  );
}
