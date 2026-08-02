"use client";

import { useState } from "react";
import { Minus, Maximize2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function DashboardFormModal({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const common = useTranslations("common");
  const modal = useTranslations("dashboardModal");
  const [minimized, setMinimized] = useState(false);

  const close = () => router.push(closeHref);

  return (
    <div className={`dashboard-form-backdrop${minimized ? " is-minimized" : ""}`}>
      <section className="dashboard-form-window" role="dialog" aria-modal={!minimized} aria-label={title}>
        <header>
          <h2>{title}</h2>
          <div>
            <button type="button" onClick={() => setMinimized((value) => !value)} aria-label={minimized ? modal("restore") : modal("minimize")}>
              {minimized ? <Maximize2 /> : <Minus />}
            </button>
            <button type="button" onClick={close} aria-label={common("close")}><X /></button>
          </div>
        </header>
        <div className="dashboard-form-window-body">{children}</div>
      </section>
    </div>
  );
}
