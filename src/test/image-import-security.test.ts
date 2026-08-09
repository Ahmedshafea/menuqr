import { describe, expect, it } from "vitest";
import { allowedImageHost } from "@/lib/image-import-security";

describe("remote image ingestion allowlist", () => {
  it.each(["localhost", "127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "metadata.google.internal", "supabase.co.attacker.test", "images.unsplash.com.attacker.test"])("rejects internal or deceptive host %s", (host) => {
    expect(allowedImageHost(host)).toBe(false);
  });

  it.each(["images.unsplash.com", "project.supabase.co"])("accepts explicitly trusted host %s", (host) => {
    expect(allowedImageHost(host)).toBe(true);
  });
});
