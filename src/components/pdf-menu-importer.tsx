"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, FileText, Plus, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PdfMenuImport } from "@/lib/pdf-menu-import";

type Phase = "idle" | "uploading" | "analyzing" | "preview" | "saving" | "success";
type Summary = { createdCategories: number; createdProducts: number; skippedProducts: number };

function uploadPdf(url: string, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", "application/pdf");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("PDF_UPLOAD_FAILED"));
    request.onerror = () => reject(new Error("PDF_UPLOAD_FAILED"));
    request.send(file);
  });
}

export function PdfMenuImporter() {
  const t = useTranslations("pdfImport");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [menu, setMenu] = useState<PdfMenuImport | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const busy = phase === "uploading" || phase === "analyzing" || phase === "saving";

  const errorMessage = (code: string) => {
    const known = ["EMPTY_PDF", "PDF_TOO_LARGE", "UNSUPPORTED_PDF", "CORRUPTED_PDF", "GEMINI_NOT_CONFIGURED", "GEMINI_TIMEOUT", "GEMINI_QUOTA_EXCEEDED", "GEMINI_PREPAY_DEPLETED", "INVALID_AI_RESPONSE", "EMPTY_AI_RESPONSE", "PDF_UPLOAD_FAILED"];
    return known.includes(code) ? t(`errors.${code}`) : t("errors.default");
  };

  async function process(file: File) {
    setError("");
    setSummary(null);
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      setError(errorMessage("UNSUPPORTED_PDF")); return;
    }
    if (!file.size) { setError(errorMessage("EMPTY_PDF")); return; }
    if (file.size > 20 * 1024 * 1024) { setError(errorMessage("PDF_TOO_LARGE")); return; }
    try {
      setPhase("uploading");
      setProgress(0);
      const signedResponse = await fetch("/api/products/import-pdf/upload-url", { method: "POST" });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed.error?.code || "PDF_UPLOAD_FAILED");
      await uploadPdf(signed.signedUrl, file, setProgress);
      setPhase("analyzing");
      const analyzeResponse = await fetch("/api/products/import-pdf/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: signed.path }),
      });
      const analyzed = await analyzeResponse.json();
      if (!analyzeResponse.ok) throw new Error(analyzed.error?.code || "INVALID_AI_RESPONSE");
      setMenu(analyzed);
      setPhase("preview");
    } catch (caught) {
      setPhase("idle");
      setError(errorMessage(caught instanceof Error ? caught.message : "default"));
    }
  }

  const updateCategory = (categoryIndex: number, name: string) =>
    setMenu((current) => current && ({ ...current, categories: current.categories.map((category, index) => index === categoryIndex ? { ...category, name } : category) }));
  const updateItem = (categoryIndex: number, itemIndex: number, patch: Partial<PdfMenuImport["categories"][number]["items"][number]>) =>
    setMenu((current) => current && ({ ...current, categories: current.categories.map((category, index) => index === categoryIndex ? { ...category, items: category.items.map((item, inner) => inner === itemIndex ? { ...item, ...patch } : item) } : category) }));
  const removeItem = (categoryIndex: number, itemIndex: number) =>
    setMenu((current) => current && ({ ...current, categories: current.categories.map((category, index) => index === categoryIndex ? { ...category, items: category.items.filter((_, inner) => inner !== itemIndex) } : category) }));
  const addItem = (categoryIndex: number) =>
    setMenu((current) => current && ({ ...current, categories: current.categories.map((category, index) => index === categoryIndex ? { ...category, items: [...category.items, { name: "", description: "", price: 0, currency: "", image: null }] } : category) }));
  const moveItem = (categoryIndex: number, itemIndex: number, targetCategory: number) =>
    setMenu((current) => {
      if (!current || categoryIndex === targetCategory) return current;
      const categories = current.categories.map((category) => ({ ...category, items: [...category.items] }));
      const [item] = categories[categoryIndex].items.splice(itemIndex, 1);
      categories[targetCategory].items.push(item);
      return { categories };
    });
  const moveCategory = (index: number, direction: -1 | 1) =>
    setMenu((current) => {
      if (!current || index + direction < 0 || index + direction >= current.categories.length) return current;
      const categories = [...current.categories];
      [categories[index], categories[index + direction]] = [categories[index + direction], categories[index]];
      return { categories };
    });

  async function save() {
    if (!menu) return;
    setError("");
    setPhase("saving");
    const response = await fetch("/api/products/import-pdf/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(menu),
    });
    const result = await response.json();
    if (!response.ok) { setPhase("preview"); setError(errorMessage(result.error?.code || "default")); return; }
    setSummary(result);
    setPhase("success");
    router.refresh();
  }

  if (phase === "success" && summary) return <section className="pdf-import-success"><CheckCircle2/><h2>{t("successTitle")}</h2><p>{t("summary", summary)}</p><button className="button primary" onClick={() => router.push("/dashboard/menu")}>{t("viewProducts")}</button></section>;

  return <div className="pdf-importer">
    {!menu && <section
      className={`pdf-dropzone ${busy ? "is-busy" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy) void process(file); }}
    >
      <UploadCloud/>
      <h2>{t("dropTitle")}</h2>
      <p>{t("dropText")}</p>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void process(file); }}/>
      <button className="button primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}><FileText/>{t("choose")}</button>
      <small>{t("limits")}</small>
      {busy && <div className="pdf-progress"><span style={{ width: `${phase === "analyzing" ? 100 : progress}%` }}/><b>{phase === "analyzing" ? t("analyzing") : t("uploading", { progress })}</b></div>}
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {menu && <section className="pdf-preview">
      <header><div><h2>{t("previewTitle")}</h2><p>{t("previewText")}</p></div><button className="button ghost" type="button" onClick={() => { setMenu(null); setPhase("idle"); }}>{t("replaceFile")}</button></header>
      {menu.categories.map((category, categoryIndex) => <article className="pdf-category" key={`${categoryIndex}`}>
        <header>
          <input aria-label={t("categoryName")} value={category.name} onChange={(event) => updateCategory(categoryIndex, event.target.value)}/>
          <div><button type="button" aria-label={t("moveUp")} disabled={!categoryIndex} onClick={() => moveCategory(categoryIndex, -1)}><ArrowUp/></button><button type="button" aria-label={t("moveDown")} disabled={categoryIndex === menu.categories.length - 1} onClick={() => moveCategory(categoryIndex, 1)}><ArrowDown/></button></div>
        </header>
        <div className="pdf-products">
          {category.items.map((item, itemIndex) => <div className="pdf-product-row" key={`${categoryIndex}-${itemIndex}`}>
            <input value={item.name} placeholder={t("productName")} onChange={(event) => updateItem(categoryIndex, itemIndex, { name: event.target.value })}/>
            <input value={item.description} placeholder={t("description")} onChange={(event) => updateItem(categoryIndex, itemIndex, { description: event.target.value })}/>
            <input type="number" min="0" step="0.01" value={item.price} aria-label={t("price")} onChange={(event) => updateItem(categoryIndex, itemIndex, { price: Number(event.target.value) })}/>
            <input value={item.currency} placeholder={t("currency")} onChange={(event) => updateItem(categoryIndex, itemIndex, { currency: event.target.value })}/>
            <select aria-label={t("moveTo")} value={categoryIndex} onChange={(event) => moveItem(categoryIndex, itemIndex, Number(event.target.value))}>{menu.categories.map((target, targetIndex) => <option value={targetIndex} key={targetIndex}>{target.name}</option>)}</select>
            <button className="icon-danger" type="button" aria-label={t("delete")} onClick={() => removeItem(categoryIndex, itemIndex)}><Trash2/></button>
          </div>)}
        </div>
        <button className="button ghost" type="button" onClick={() => addItem(categoryIndex)}><Plus/>{t("addProduct")}</button>
      </article>)}
      <footer><button className="button primary large" disabled={phase === "saving"} onClick={() => void save()}>{phase === "saving" ? t("saving") : t("confirmImport")}</button></footer>
    </section>}
  </div>;
}
