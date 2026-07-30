import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { getTranslations } from "next-intl/server";

export default async function Login() {
  const t = await getTranslations("auth");
  return (
    <div className="auth-box">
      <h1>{t("welcome")}</h1>
      <p>{t("loginSubtitle")}</p>
      <AuthForm mode="login" />
      <div className="auth-bottom">
        {t("new")} <Link href="/register">{t("createFree")}</Link>
      </div>
      <div className="auth-bottom">
        {t("customerAccount")}{" "}
        <Link href="/customer/login">{t("customerLogin")}</Link>
      </div>
    </div>
  );
}
