"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lightbulb,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { showSuccessToast } from "@/components/toast-provider";

type Labels = Record<
  | "title" | "description" | "choose" | "upload" | "templateXlsx"
  | "templateCsv" | "success" | "error" | "close" | "requirementsTitle"
  | "requirementsDescription" | "productNameRequired" | "categoryRequired"
  | "priceRequired" | "imageOptional" | "ifImageProvided" | "httpsOnly"
  | "directImage" | "supportedFormats" | "recommendedSize" | "maximumSize"
  | "notSupported" | "googleDrive" | "googlePhotos" | "dropbox" | "oneDrive"
  | "htmlPages" | "tipTitle" | "tipText" | "invalidImage" | "invalidDirectImage"
  | "imageTooLarge" | "rowError" | "productNameError" | "categoryError"
  | "priceError" | "stockError" | "booleanError" | "invalidRow",
  string
>;

type ImportError = { rowNumber?: number; reason?: string };

export function ProductImportDialog({ labels }: { labels: Labels }) {
  const details = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const reasonText = (error: ImportError) => {
    const reasons: Record<string, string> = {
      UNSUPPORTED_IMAGE_URL: labels.invalidImage,
      NOT_DIRECT_IMAGE: labels.invalidDirectImage,
      IMAGE_TOO_LARGE: labels.imageTooLarge,
      "image_url must use https": labels.invalidImage,
      "image_url uses an unsupported sharing service": labels.invalidImage,
      PRODUCT_NAME_REQUIRED: labels.productNameError,
      CATEGORY_REQUIRED: labels.categoryError,
      INVALID_PRICE: labels.priceError,
      INVALID_STOCK: labels.stockError,
      INVALID_BOOLEAN: labels.booleanError,
    };
    return labels.rowError
      .replace("{rowNumber}", String(error.rowNumber ?? "—"))
      .replace("{reason}", reasons[error.reason ?? ""] ?? labels.invalidRow);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/products/import", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const errors = Array.isArray(result.error?.details)
        ? (result.error.details as ImportError[])
        : [];
      return setMessage({
        ok: false,
        text: errors.length
          ? errors.map(reasonText).join("\n")
          : labels.error,
      });
    }
    setMessage({
      ok: true,
      text: labels.success
        .replace("{created}", String(result.created))
        .replace("{updated}", String(result.updated)),
    });
    showSuccessToast(
      labels.success
        .replace("{created}", String(result.created))
        .replace("{updated}", String(result.updated)),
    );
    router.refresh();
  }

  return (
    <details ref={details} className="product-create">
      <summary className="button ghost"><Upload />{labels.title}</summary>
      <div className="product-form-panel import-panel">
        <button type="button" className="details-close" aria-label={labels.close} onClick={() => details.current?.removeAttribute("open")}><X /></button>
        <h2><FileSpreadsheet />{labels.title}</h2>
        <p>{labels.description}</p>

        <section className="import-requirements">
          <h3>{labels.requirementsTitle}</h3>
          <p>{labels.requirementsDescription}</p>
          <ul className="import-valid-list">
            {[labels.productNameRequired, labels.categoryRequired, labels.priceRequired, labels.imageOptional].map((item) => <li key={item}><CheckCircle2 />{item}</li>)}
          </ul>
          <h4>{labels.ifImageProvided}</h4>
          <ul>
            {[labels.httpsOnly, labels.directImage, labels.supportedFormats, labels.recommendedSize, labels.maximumSize].map((item) => <li key={item}>{item}</li>)}
          </ul>
          <h4>{labels.notSupported}</h4>
          <ul className="import-invalid-list">
            {[labels.googleDrive, labels.googlePhotos, labels.dropbox, labels.oneDrive, labels.htmlPages].map((item) => <li key={item}><XCircle />{item}</li>)}
          </ul>
          <aside><Lightbulb /><div><b>{labels.tipTitle}</b><p>{labels.tipText}</p></div></aside>
        </section>

        <div className="template-links">
          <a className="button primary" href="/templates/products-import-template.xlsx" download><Download />{labels.templateXlsx}</a>
          <a className="button ghost" href="/templates/products-import-template.csv" download>{labels.templateCsv}</a>
        </div>
        <form onSubmit={submit}>
          <label>{labels.choose}<input name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
          <button className="button primary" disabled={busy}>{busy ? "…" : labels.upload}</button>
        </form>
        {message && <p className={message.ok ? "form-success" : "form-error"}>{message.text}</p>}
      </div>
    </details>
  );
}
