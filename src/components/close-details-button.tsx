"use client";

import { useState } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { useTranslations } from "next-intl";

export function CloseDetailsButton() {
  const common = useTranslations("common");
  const modal = useTranslations("dashboardModal");
  const [minimized, setMinimized] = useState(false);

  const toggle = (button: HTMLButtonElement) => {
    const panel = button.closest<HTMLElement>(
      ".product-form-panel,.team-form-panel,.import-panel",
    );
    panel?.classList.toggle("is-minimized");
    setMinimized((value) => !value);
  };

  return (
    <div className="modal-window-controls">
      <button
        type="button"
        className="modal-minimize"
        aria-label={minimized ? modal("restore") : modal("minimize")}
        onClick={(event) => toggle(event.currentTarget)}
      >
        {minimized ? <Maximize2 /> : <Minus />}
      </button>
      <button
        type="button"
        className="modal-close"
        aria-label={common("close")}
        onClick={(event) =>
          event.currentTarget.closest("details")?.removeAttribute("open")
        }
      >
        <X />
      </button>
    </div>
  );
}
