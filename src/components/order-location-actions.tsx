"use client";

import { useEffect, useState } from "react";
import { Clipboard, ExternalLink, MapPin, X } from "lucide-react";
import LocationField from "@/components/map/LocationField";

export function OrderLocationActions({
  latitude,
  longitude,
  labels,
}: {
  latitude: number;
  longitude: number;
  labels: {
    view: string;
    title: string;
    openGoogle: string;
    copy: string;
    copied: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const googleUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  async function copyCoordinates() {
    await navigator.clipboard.writeText(`${latitude},${longitude}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <button type="button" className="button ghost" onClick={() => setOpen(true)}>
        <MapPin />
        {labels.view}
      </button>
      {open && (
        <div className="location-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="location-modal"
            role="dialog"
            aria-modal="true"
            aria-label={labels.title}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2><MapPin />{labels.title}</h2>
              <button type="button" className="location-modal-close" aria-label="Close" onClick={() => setOpen(false)}>
                <X />
              </button>
            </header>
            <LocationField initialLat={latitude} initialLng={longitude} readOnly />
            <div className="location-modal-actions">
              <a className="button primary" href={googleUrl} target="_blank" rel="noreferrer">
                <ExternalLink />{labels.openGoogle}
              </a>
              <button type="button" className="button ghost" onClick={copyCoordinates}>
                <Clipboard />{copied ? labels.copied : labels.copy}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
