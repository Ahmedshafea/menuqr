"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
export function CloseDetailsButton(){const t=useTranslations("common");return <button type="button" className="modal-close" aria-label={t("close")} onClick={event=>event.currentTarget.closest("details")?.removeAttribute("open")}><X/></button>}
