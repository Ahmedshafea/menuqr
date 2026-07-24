"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Package, QrCode, ShoppingBag, Star } from "lucide-react";

type Item = {
  id: string;
  type: "NEW_ORDER" | "APPROVAL_REQUIRED" | "OUT_OF_STOCK" | "NEW_CUSTOMER" | "FIRST_QR_SCAN" | "NEW_REVIEW" | "LOW_RATING" | "DRIVER_ASSIGNED" | "DRIVER_CHANGED" | "DELIVERY_COMPLETED";
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  unread: boolean;
};

const icons = {
  NEW_ORDER: ShoppingBag,
  APPROVAL_REQUIRED: Bell,
  OUT_OF_STOCK: Package,
  NEW_CUSTOMER: Star,
  FIRST_QR_SCAN: QrCode,
  NEW_REVIEW: Star,
  LOW_RATING: Star,
  DRIVER_ASSIGNED: Package,
  DRIVER_CHANGED: Package,
  DELIVERY_COMPLETED: Package,
};

export function RestaurantNotificationCenter({
  items,
  labels,
}: {
  items: Item[];
  labels: { title: string; empty: string; markRead: string };
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(items);
  const unread = notifications.filter((item) => item.unread).length;

  useEffect(() => {
    const latest = items.find((item) => item.unread);
    if (!latest || !localStorage.getItem("menuqr-browser-notifications")) return;
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(latest.title, { body: latest.body ?? undefined });
    if (localStorage.getItem("menuqr-notification-sound")) {
      const audio = new Audio(
        "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAqMDAuKCAgJiwwMCo",
      );
      void audio.play().catch(() => undefined);
    }
  }, [items]);

  async function markRead(ids: string[]) {
    if (!ids.length) return;
    setNotifications((current) =>
      current.map((item) => (ids.includes(item.id) ? { ...item, unread: false } : item)),
    );
    await fetch("/api/dashboard/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void markRead(notifications.filter((item) => item.unread).map((item) => item.id));
  }

  return (
    <div className="notification-center">
      <button type="button" className="notification-trigger" onClick={toggle} aria-label={labels.title}>
        <Bell />
        {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
      </button>
      {open && (
        <section className="notification-popover">
          <header>
            <h2>{labels.title}</h2>
            {unread > 0 && (
              <button onClick={() => markRead(notifications.filter((item) => item.unread).map((item) => item.id))}>
                <Check /> {labels.markRead}
              </button>
            )}
          </header>
          <div>
            {notifications.length ? notifications.map((item) => {
              const Icon = icons[item.type];
              const content = (
                <>
                  <Icon />
                  <span>
                    <strong>{item.title}</strong>
                    {item.body && <small>{item.body}</small>}
                    <time>{new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
                  </span>
                </>
              );
              return item.href ? <a href={item.href} key={item.id}>{content}</a> : <article key={item.id}>{content}</article>;
            }) : <p>{labels.empty}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
