"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, QrCode, X } from "lucide-react";
import { usePathname } from "next/navigation";

export function CustomerShellWrapper({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.classList.toggle("customer-drawer-open", open);
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("customer-drawer-open");
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <main className="customer-shell">
      <header className="customer-mobile-header">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
          <Menu />
        </button>
        <Link href="/" className="brand"><span><QrCode /></span>MenuQR</Link>
      </header>
      <button type="button" aria-label="Close menu" className={`customer-overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <div className={`customer-drawer ${open ? "open" : ""}`}>
        <button type="button" className="customer-drawer-close" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
        {sidebar}
      </div>
      {children}
    </main>
  );
}