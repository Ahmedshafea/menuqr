"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale(); const t = useTranslations("language"); const router = useRouter();
  function switchLanguage() { const next = locale === "ar" ? "en" : "ar"; document.cookie = `MENUQR_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }
  return <button type="button" className={compact ? "language-button compact" : "language-button"} onClick={switchLanguage} aria-label={t("switch")}><Languages />{locale === "ar" ? "English" : "العربية"}</button>;
}
