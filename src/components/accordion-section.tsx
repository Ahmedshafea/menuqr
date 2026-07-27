"use client";

import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";

export function AccordionSection({
  title,
  children,
  className = "",
  id,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section id={id} className={`ux-accordion ${open ? "is-open" : ""} ${className}`}>
      <button
        type="button"
        className="ux-accordion-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span><ChevronDown />
      </button>
      <div className="ux-accordion-grid" aria-hidden={!open}>
        <div className="ux-accordion-content">{children}</div>
      </div>
    </section>
  );
}
