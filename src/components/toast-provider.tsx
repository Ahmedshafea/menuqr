"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function showSuccessToast(message: string) {
  window.dispatchEvent(new CustomEvent("menuqr:toast", { detail: message }));
}

export function ToastProvider() {
  const t = useTranslations("toast");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("toast");
    if (key && t.has(key)) {
      setMessage(t(key));
      params.delete("toast");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }
    const listener = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener("menuqr:toast", listener);
    return () => window.removeEventListener("menuqr:toast", listener);
  }, [t]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);
  if (!message) return null;
  return <div className="global-toast" role="status"><CheckCircle2 /><span>{message}</span><button onClick={() => setMessage("")} aria-label={t("close")}><X /></button></div>;
}
