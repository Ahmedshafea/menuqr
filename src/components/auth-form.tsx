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

export function AuthForm({
  mode,
  redirectTo = "/auth/continue",
}: {
  mode: "login" | "register";
  redirectTo?: "/auth/continue" | "/account";
}) {
  const router = useRouter();
  const t = useTranslations("auth");
  const wa = useTranslations("whatsappAuth");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpVerificationToken, setOtpVerificationToken] = useState("");

  async function requestOtp(form: FormData) {
    const response = await fetch("/api/whatsapp/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: form.get("whatsapp"),
        language: document.documentElement.lang === "en" ? "en" : "ar",
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.error?.code ?? "OTP_SEND_FAILED");
    setOtpRequested(true);
    setOtpVerificationToken("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    if (mode === "register") {
      if (!otpRequested) {
        try {
          await requestOtp(form);
        } catch (otpError) {
          setError(
            otpError instanceof Error ? otpError.message : wa("otpSendFailed"),
          );
        } finally {
          setLoading(false);
        }
        return;
      }

      let verificationToken = otpVerificationToken;
      if (!verificationToken) {
        const verificationResponse = await fetch("/api/whatsapp/verify-otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phone: form.get("whatsapp"),
            code: form.get("otp"),
          }),
        });
        const verification = await verificationResponse
          .json()
          .catch(() => null);
        if (!verificationResponse.ok || !verification?.verificationToken) {
          setError(verification?.error?.code ?? wa("invalidOtp"));
          setLoading(false);
          return;
        }
        verificationToken = verification.verificationToken;
        setOtpVerificationToken(verificationToken);
      }
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(form),
          turnstileToken,
          otpVerificationToken: verificationToken,
        }),
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
      router.push(redirectTo);
      router.refresh();
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
            <input
              name="whatsapp"
              required
              inputMode="tel"
              readOnly={otpRequested}
            />
          </label>
          {otpRequested && (
            <label>
              {wa("otp")}
              <input
                name="otp"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
              />
              <small>{wa("otpHelp")}</small>
            </label>
          )}
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
        {loading
          ? t("wait")
          : mode === "login"
            ? t("signIn")
            : otpRequested
              ? wa("verifyAndCreate")
              : wa("sendOtp")}
      </button>
      {mode === "register" && otpRequested && (
        <button
          className="button ghost"
          type="button"
          disabled={loading}
          onClick={async () => {
            const form = document.querySelector<HTMLFormElement>(".auth-form");
            if (!form) return;
            setLoading(true);
            setError("");
            try {
              await requestOtp(new FormData(form));
            } catch (otpError) {
              setError(
                otpError instanceof Error
                  ? otpError.message
                  : wa("otpSendFailed"),
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          {wa("resendOtp")}
        </button>
      )}
    </form>
  );
}
