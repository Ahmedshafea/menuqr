export function whatsappUrl(phone: string, message: string) { return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`; }

export function applicationUrl(requestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
}

export function publicOrderUrl(accessToken: string, requestUrl?: string) {
  return `${applicationUrl(requestUrl)}/order/${encodeURIComponent(accessToken)}`;
}
