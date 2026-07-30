"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Store,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { compactBranchLocation } from "@/lib/branch-display";

export type PublicBranchItem = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city?: string | null;
  phone: string | null;
  whatsapp: string;
  directions: string | null;
  isOpen: boolean;
};

export function PublicBranchDialog({
  restaurantSlug,
  branches,
}: {
  restaurantSlug: string;
  branches: PublicBranchItem[];
}) {
  const t = useTranslations("branches");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!branches.length) return null;

  return (
    <>
      <button
        type="button"
        className="menu-branch-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Building2 />
        <span>{t("ourBranches")}</span>
        <i>{branches.length}</i>
      </button>
      {open && (
        <div
          className="branch-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="branch-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-dialog-title"
          >
            <header>
              <div>
                <span><Store /></span>
                <div>
                  <h2 id="branch-dialog-title">{t("ourBranches")}</h2>
                  <p>{t("chooseBranchHelp")}</p>
                </div>
              </div>
              <button
                type="button"
                className="branch-dialog-close"
                onClick={() => setOpen(false)}
                aria-label={common("close")}
                autoFocus
              >
                <X />
              </button>
            </header>
            <div className="branch-dialog-list">
              {branches.map((branch) => (
                <article key={branch.id}>
                  <div className="branch-dialog-copy">
                    <div>
                      <h3>{branch.name}</h3>
                      <span
                        className={branch.isOpen ? "status-ok" : "status-muted"}
                      >
                        {branch.isOpen ? t("open") : t("closedNow")}
                      </span>
                    </div>
                    <p>
                      <MapPin />
                      {compactBranchLocation(branch.address, branch.city)}
                    </p>
                  </div>
                  <div className="branch-dialog-actions">
                    <Link
                      href={`/menu/${restaurantSlug}/${branch.slug}`}
                      className="button primary"
                      onClick={() => setOpen(false)}
                    >
                      <ExternalLink />
                      {t("viewBranch")}
                    </Link>
                    {branch.phone && (
                      <a
                        href={`tel:${branch.phone}`}
                        className="branch-icon-action"
                        aria-label={t("call")}
                        title={t("call")}
                      >
                        <Phone />
                      </a>
                    )}
                    <a
                      href={`https://wa.me/${branch.whatsapp.replace(/\D/g, "")}`}
                      className="branch-icon-action whatsapp"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                      title="WhatsApp"
                    >
                      <MessageCircle />
                    </a>
                    {branch.directions && (
                      <a
                        href={branch.directions}
                        className="branch-icon-action"
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("directions")}
                        title={t("directions")}
                      >
                        <MapPin />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
