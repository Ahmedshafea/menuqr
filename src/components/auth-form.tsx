"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

const TurnstileWidget = dynamic(
  () =>
    import("@/components/turnstile-widget").then(
      (module) => module.TurnstileWidget,
    ),
  { ssr: false },
);

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const t = useTranslations("auth");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    if (mode === "register") {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(form), turnstileToken }),
      });
      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: t("failed") }));
        setError(
          body.error?.details?.message ??
            body.error?.code ??
            body.error ??
            t("failed"),
        );
        setLoading(false);
        return;
      }
    }

    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
    if (result?.error) {
      setError(t("incorrect"));
      setLoading(false);
    } else {
      router.push("/auth/continue");
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === "register" && (
        <>
          <label>
            {t("name")}
            <input name="name" required minLength={2} />
          </label>
          <label>
            {t("restaurantName")}
            <input name="restaurantName" required minLength={2} />
          </label>
          <label>
            {t("menuUrl")}
            <div className="slug">
              <span>menuqr.com/menu/</span>
              <input name="slug" required minLength={3} />
            </div>
          </label>
          <label>
            {t("whatsapp")}
            <input name="whatsapp" required inputMode="tel" />
          </label>
        </>
      )}
      <label>
        {t("email")}
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        {t("password")}
        <input
          name="password"
          type="password"
          required
          minLength={8}
          pattern={
            mode === "register" ? "(?=.*[A-Z])(?=.*[0-9]).{8,}" : undefined
          }
          title={mode === "register" ? t("passwordHint") : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "register" && <small>{t("passwordHint")}</small>}
      </label>
      {mode === "register" && <TurnstileWidget onToken={setTurnstileToken} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary large" disabled={loading}>
        {loading ? t("wait") : mode === "login" ? t("signIn") : t("create")}
      </button>
    </form>
  );
}
