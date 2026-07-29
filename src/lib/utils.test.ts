import { describe, expect, it } from "vitest";
import { applicationUrl, publicOrderUrl, whatsappUrl } from "./utils";

describe("WhatsApp and application URLs", () => {
  it("normalizes phone and encodes message", () => {
    expect(whatsappUrl("+20 100-000", "Hello & أهلاً")).toBe(
      "https://wa.me/20100000?text=Hello%20%26%20%D8%A3%D9%87%D9%84%D8%A7%D9%8B",
    );
  });

  it("uses the request origin when no application URL is configured", () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(applicationUrl("https://menuqr.example/api/orders")).toBe(
      "https://menuqr.example",
    );
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  });

  it("builds an encoded public order URL without exposing a database id", () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://menuqr-eg.vercel.app/";
    expect(publicOrderUrl("secure_token")).toBe(
      "https://menuqr-eg.vercel.app/order/secure_token",
    );
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  });
});
