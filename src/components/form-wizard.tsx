"use client";

import { Children, type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function FormWizard({
  children,
  stepTitles,
  previousLabel,
  nextLabel,
  finishLabel,
}: {
  children: ReactNode;
  stepTitles: string[];
  previousLabel: string;
  nextLabel: string;
  finishLabel: string;
}) {
  const steps = Children.toArray(children);
  const [current, setCurrent] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button")
      ?.focus({ preventScroll: true });
  }, [current]);

  function next() {
    const panel = panelRef.current;
    const fields = panel?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    );
    if (fields && !Array.from(fields).every((field) => field.reportValidity())) return;
    setCurrent((value) => Math.min(steps.length - 1, value + 1));
  }

  return (
    <div className="form-wizard">
      <div className="wizard-progress" aria-label={`${current + 1} / ${steps.length}`}>
        <span>{current + 1} / {steps.length}</span>
        <strong>{stepTitles[current]}</strong>
        <i style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="wizard-panel" ref={panelRef} key={current}>
        {steps[current]}
      </div>
      <div className="wizard-actions">
        {current > 0 && (
          <button type="button" className="button ghost" onClick={() => setCurrent((value) => value - 1)}>
            <ChevronLeft />{previousLabel}
          </button>
        )}
        {current < steps.length - 1 ? (
          <button type="button" className="button primary" onClick={next}>
            {nextLabel}<ChevronRight />
          </button>
        ) : (
          <button type="submit" className="button primary">
            {finishLabel}
          </button>
        )}
      </div>
    </div>
  );
}
