"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function PasswordResetForm({ audience }: { audience: "customer" | "restaurant" }) {
  const t = useTranslations("security");
  const [step, setStep] = useState<"phone" | "reset" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loginHref = audience === "customer" ? "/customer/login" : "/login";

  async function sendCode() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/whatsapp/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          language: document.documentElement.lang === "en" ? "en" : "ar",
        }),
      });
      if (!response.ok) throw new Error("OTP_SEND_FAILED");
      setStep("reset");
    } catch {
      setError(t("requestFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      setError(t("mismatch"));
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code: form.get("code"), password, confirmPassword }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body?.error?.code;
        setError(code === "INVALID_OTP" || code === "OTP_EXPIRED" ? t("invalidCode") : code === "INVALID_PASSWORD_RESET" ? t("invalidPassword") : t("resetFailed"));
        return;
      }
      setStep("done");
    } catch {
      setError(t("resetFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (step === "done")
    return <div className="auth-form"><p className="form-success" role="status">{t("resetSuccess")}</p><Link className="button primary large" href={loginHref}>{t("backToLogin")}</Link></div>;

  return (
    <form className="auth-form" onSubmit={step === "phone" ? (event) => { event.preventDefault(); void sendCode(); } : submit}>
      <label>{t("phone")}<input value={phone} onChange={(event) => setPhone(event.target.value)} name="phone" required inputMode="tel" autoComplete="tel" readOnly={step === "reset"} /></label>
      {step === "reset" && <>
        <label>{t("code")}<input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus /></label>
        <label>{t("newPassword")}<input name="password" type="password" required minLength={8} maxLength={128} pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}" autoComplete="new-password" /><small>{t("passwordHint")}</small></label>
        <label>{t("confirmPassword")}<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary large" disabled={loading}>{loading ? t("wait") : step === "phone" ? t("sendCode") : t("resetPassword")}</button>
      {step === "reset" && <button className="button ghost" type="button" disabled={loading} onClick={() => void sendCode()}>{t("sendCode")}</button>}
      <Link className="auth-bottom" href={loginHref}>{t("backToLogin")}</Link>
    </form>
  );
}
