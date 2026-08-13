import { describe, expect, it } from "vitest";
import { globalSecurityHeaders } from "../../next.config";

const values = (production: boolean) =>
  new Map(globalSecurityHeaders(production).map(({ key, value }) => [key, value]));

describe("global response security headers", () => {
  it("applies transport and content hardening to production responses", () => {
    const headers = values(true);
    expect(headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(self)");
  });

  it("does not enable HSTS in non-production environments", () => {
    expect(values(false).has("Strict-Transport-Security")).toBe(false);
  });
});
