"use client";

import { useState, useEffect } from "react";
import { Menu, X, QrCode, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DashboardWrapper({
  children,
  sidebar,
  brand,
  notifications,
  languageSwitcher,
  signOutAction,
  signOutLabel,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  brand: React.ReactNode;
  notifications: React.ReactNode;
  languageSwitcher: React.ReactNode;
  signOutAction: (formData: FormData) => void | Promise<void>;
  signOutLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on navigation
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("dashboard-drawer-open", isOpen);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("dashboard-drawer-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <main className="dash">
      {/* Mobile Header */}
      <div className="dash-mobile-header">
        <button className="dash-menu-button" onClick={() => setIsOpen(true)} aria-label="Open menu" aria-expanded={isOpen}>
          <Menu />
        </button>
        <Link href="/" className="brand">
          <span><QrCode /></span>
          MenuQR
        </Link>
        {notifications}
      </div>

      {/* Overlay */}
      <div 
        className={`dash-overlay ${isOpen ? "open" : ""}`} 
        onClick={() => setIsOpen(false)} 
      />

      {/* Sidebar */}
      <aside className={`dash-side ${isOpen ? "open" : ""}`}>
        <div className="dash-brand-row">
          {brand}
          <div className="dash-drawer-tools">
            {notifications}
            <button 
              type="button"
              className="dash-drawer-close" 
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        {languageSwitcher}
        
        <div className="dash-sidebar-scroll">
          {sidebar}
        </div>

        <form action={signOutAction} className="dash-signout-form">
          <button className="dash-signout-button">
            <LogOut size={18} />
            {signOutLabel}
          </button>
        </form>
      </aside>

      <div className="dash-content-wrapper">
        {children}
      </div>
    </main>
  );
}
