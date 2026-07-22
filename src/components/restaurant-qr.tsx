"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";

type Props = {
  menuUrl: string;
  slug: string;
  label: string;
  controls?: { png: string; svg: string; copy: string; copied: string };
};

export function RestaurantQr({ menuUrl, slug, label, controls }: Props) {
  const canvasWrap = useRef<HTMLDivElement>(null);
  const svgWrap = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const value = useMemo(() => menuUrl.trim(), [menuUrl]);
  const fileName = useMemo(() => `menuqr-${slug}`, [slug]);

  function downloadPng() {
    const canvas = canvasWrap.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${fileName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  function downloadSvg() {
    const svg = svgWrap.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${fileName}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function copyLink() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div
      className={`restaurant-qr-card ${controls ? "qr-dashboard-card" : ""}`}
    >
      <div ref={canvasWrap} className="restaurant-qr-canvas">
        <QRCodeCanvas
          value={value}
          size={220}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>
      <div ref={svgWrap} className="restaurant-qr-svg" aria-hidden="true">
        <QRCodeSVG
          value={value}
          size={1024}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>
      <small>{label}</small>
      {controls && (
        <div className="qr-actions">
          <button type="button" className="button ghost" onClick={downloadPng}>
            <Download />
            {controls.png}
          </button>
          <button type="button" className="button ghost" onClick={downloadSvg}>
            <Download />
            {controls.svg}
          </button>
          <button type="button" className="button primary" onClick={copyLink}>
            {copied ? <Check /> : <Copy />}
            {copied ? controls.copied : controls.copy}
          </button>
        </div>
      )}
    </div>
  );
}
