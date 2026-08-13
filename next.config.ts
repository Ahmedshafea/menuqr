import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

export function globalSecurityHeaders(production = process.env.NODE_ENV === "production") {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    ...(production
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
      : []),
  ];
}

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
  async headers() {
    return [{ source: "/:path*", headers: globalSecurityHeaders() }];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    deviceSizes: [360, 540, 768, 1024, 1280],
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
