import { NextResponse, type NextRequest } from "next/server";
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.get("MENUQR_LOCALE")) {
    const locale = request.headers.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "ar";
    response.cookies.set("MENUQR_LOCALE", locale, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  }
  response.headers.set("X-Content-Type-Options", "nosniff"); response.headers.set("X-Frame-Options", "DENY"); response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin"); response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  return response;
}
export const config = { matcher: "/((?!api|_next/static|_next/image|favicon.ico).*)" };
