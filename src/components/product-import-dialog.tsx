"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload, X } from "lucide-react";

type Props = { labels: Record<"title" | "description" | "choose" | "upload" | "templateXlsx" | "templateCsv" | "success" | "error" | "close", string> };

export function ProductImportDialog({ labels }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const response = await fetch("/api/products/import", { method: "POST", body: new FormData(event.currentTarget) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setMessage({ ok: false, text: typeof result.error === "string" ? result.error : result.error?.details || result.error?.code || labels.error });
    setMessage({ ok: true, text: labels.success.replace("{created}", String(result.created)).replace("{updated}", String(result.updated)) });
    router.refresh();
  }
  return <details ref={details} className="product-create">
    <summary className="button ghost"><Upload />{labels.title}</summary>
    <div className="product-form-panel import-panel">
      <button type="button" className="details-close" aria-label={labels.close} onClick={() => details.current?.removeAttribute("open")}><X /></button>
      <h2><FileSpreadsheet />{labels.title}</h2><p>{labels.description}</p>
      <div className="template-links"><a className="button ghost" href="/templates/products-import-template.xlsx" download>{labels.templateXlsx}</a><a className="button ghost" href="/templates/products-import-template.csv" download>{labels.templateCsv}</a></div>
      <form onSubmit={submit}><label>{labels.choose}<input name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label><button className="button primary" disabled={busy}>{busy ? "…" : labels.upload}</button></form>
      {message && <p className={message.ok ? "form-success" : "form-error"}>{message.text}</p>}
    </div>
  </details>;
}
