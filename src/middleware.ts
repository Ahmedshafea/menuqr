import { NextResponse, type NextRequest } from "next/server";
export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const development = process.env.NODE_ENV !== "production";
  const csp = ["default-src 'self'", `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com", "font-src 'self' data:", "connect-src 'self' https://*.supabase.co https://api.lemonsqueezy.com https://challenges.cloudflare.com", "frame-src https://challenges.cloudflare.com https://*.lemonsqueezy.com", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const hostname = (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.hostname).split(":")[0].toLowerCase();
  const configuredHost = (() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").hostname.toLowerCase(); } catch { return "localhost"; } })();
  const platformHost = hostname === configuredHost || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".vercel.app");
  const response = !platformHost && request.nextUrl.pathname === "/"
    ? NextResponse.rewrite(new URL(`/domain/${encodeURIComponent(hostname)}`, request.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  if (!request.cookies.get("MENUQR_LOCALE")) {
    const locale = request.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "ar";
    response.cookies.set("MENUQR_LOCALE", locale, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  }
  response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("X-Frame-Options", "DENY"); response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin"); response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.headers.set("Content-Security-Policy", csp);
  if (!development) response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return response;
}
export const config = { matcher: "/((?!api|_next/static|_next/image|favicon.ico).*)" };
