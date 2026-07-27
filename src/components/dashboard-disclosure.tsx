import type { ReactNode } from "react";

export function DashboardDisclosure({
  title,
  summary,
  children,
  className = "",
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`dash-disclosure ${className}`}>
      <summary>
        <span><strong>{title}</strong>{summary && <small>{summary}</small>}</span>
        <i aria-hidden="true" />
      </summary>
      <div className="dash-disclosure-body">{children}</div>
    </details>
  );
}

export function RecordDisclosure({
  title,
  meta,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="record-disclosure">
      <summary><strong>{title}</strong><span>{meta}</span><i aria-hidden="true" /></summary>
      <div>{children}</div>
    </details>
  );
}
