"use client";

import { MessageCircle, Phone, Printer } from "lucide-react";

export function CustomerQuickActions({
  phone,
  labels,
}: {
  phone: string;
  labels: {
    call: string;
    whatsapp: string;
    copyAddress: string;
    maps: string;
  };
}) {
  return (
    <div className="customer-quick-actions">
      <a href={`tel:${phone}`} className="button ghost">
        <Phone />
        {labels.call}
      </a>
      <a
        href={`https://wa.me/${phone.replace(/\D/g, "")}`}
        target="_blank"
        rel="noreferrer"
        className="button whatsapp-button"
      >
        <MessageCircle />
        {labels.whatsapp}
      </a>
    </div>
  );
}

export function OrderPrintActions({
  receipt,
  kitchen,
  restaurant,
  order,
  labels,
}: {
  receipt: string;
  kitchen: string;
  restaurant: { name: string; logoUrl?: string | null };
  order: {
    number: string;
    date: string;
    customer: string;
    phone: string;
    address?: string | null;
    currency: string;
    locale: string;
    subtotal: number;
    discount: number;
    deliveryFee: number;
    serviceFee: number;
    tax: number;
    total: number;
    items: {
      name: string;
      quantity: number;
      unitPrice: number;
      notes?: string | null;
      options: string[];
    }[];
  };
  labels: {
    invoice: string;
    kitchenTicket: string;
    customer: string;
    phone: string;
    address: string;
    item: string;
    quantity: string;
    unitPrice: string;
    subtotal: string;
    discount: string;
    deliveryFee: string;
    serviceFee: string;
    tax: string;
    total: string;
    notes: string;
  };
}) {
  const escape = (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const amount = (value: number) =>
    new Intl.NumberFormat(order.locale, {
      style: "currency",
      currency: order.currency,
    }).format(value);
  const printDocument = (mode: "receipt" | "kitchen") => {
    const isKitchen = mode === "kitchen";
    const rows = order.items
      .map(
        (item) => `<tr>
          <td><strong>${escape(item.name)}</strong>
            ${item.options.length ? `<small>${escape(item.options.join("، "))}</small>` : ""}
            ${item.notes ? `<small>${escape(labels.notes)}: ${escape(item.notes)}</small>` : ""}
          </td>
          <td>${item.quantity}</td>
          ${isKitchen ? "" : `<td>${escape(amount(item.unitPrice))}</td><td>${escape(amount(item.unitPrice * item.quantity))}</td>`}
        </tr>`,
      )
      .join("");
    const totals = isKitchen
      ? ""
      : `<section class="totals">
          <p><span>${escape(labels.subtotal)}</span><b>${escape(amount(order.subtotal))}</b></p>
          <p><span>${escape(labels.discount)}</span><b>-${escape(amount(order.discount))}</b></p>
          <p><span>${escape(labels.deliveryFee)}</span><b>${escape(amount(order.deliveryFee))}</b></p>
          <p><span>${escape(labels.serviceFee)}</span><b>${escape(amount(order.serviceFee))}</b></p>
          <p><span>${escape(labels.tax)}</span><b>${escape(amount(order.tax))}</b></p>
          <p class="grand"><span>${escape(labels.total)}</span><b>${escape(amount(order.total))}</b></p>
        </section>`;
    const html = `<!doctype html><html dir="${order.locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escape(order.number)}</title>
      <style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#183128;margin:0}.sheet{max-width:760px;margin:auto}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ef592e;padding-bottom:16px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:58px;height:58px;object-fit:cover;border-radius:12px}.brand h1{margin:0;font-size:24px}.head aside{text-align:end}.head aside b{display:block;font-size:18px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0;padding:14px;background:#f4f7f5;border-radius:12px}.meta p{margin:3px 0}.meta .wide{grid-column:1/-1}table{width:100%;border-collapse:collapse}th,td{padding:11px;border-bottom:1px solid #dde4df;text-align:start;vertical-align:top}th{background:#173b2f;color:white}td small{display:block;color:#66766e;margin-top:4px}.totals{width:min(360px,100%);margin:18px 0 0 auto}.totals p{display:flex;justify-content:space-between;margin:0;padding:7px 0;border-bottom:1px solid #edf0ee}.totals .grand{font-size:17px;color:#ef592e;border-top:2px solid #183128;margin-top:5px}.foot{text-align:center;color:#85918b;margin-top:28px;font-size:10px}</style></head>
      <body><main class="sheet"><header class="head"><div class="brand">${restaurant.logoUrl ? `<img src="${escape(restaurant.logoUrl)}">` : ""}<h1>${escape(restaurant.name)}</h1></div><aside><b>${escape(isKitchen ? labels.kitchenTicket : labels.invoice)}</b><span>${escape(order.number)}</span><small>${escape(order.date)}</small></aside></header>
      <section class="meta"><p><b>${escape(labels.customer)}:</b> ${escape(order.customer)}</p><p><b>${escape(labels.phone)}:</b> ${escape(order.phone)}</p>${order.address ? `<p class="wide"><b>${escape(labels.address)}:</b> ${escape(order.address)}</p>` : ""}</section>
      <table><thead><tr><th>${escape(labels.item)}</th><th>${escape(labels.quantity)}</th>${isKitchen ? "" : `<th>${escape(labels.unitPrice)}</th><th>${escape(labels.total)}</th>`}</tr></thead><tbody>${rows}</tbody></table>${totals}<p class="foot">MenuQR · ${escape(restaurant.name)}</p></main></body></html>`;
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  };
  return (
    <div className="order-print-actions">
      <button className="button ghost" type="button" onClick={() => printDocument("receipt")}>
        <Printer />
        {receipt}
      </button>
      <button
        className="button ghost"
        type="button"
        onClick={() => printDocument("kitchen")}
      >
        <Printer />
        {kitchen}
      </button>
    </div>
  );
}
