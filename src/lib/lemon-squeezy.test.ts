import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyLemonSignature } from "./lemon-squeezy";

describe("Lemon Squeezy webhook signatures", () => {
  beforeEach(() => { process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = "webhook-test-secret"; });
  it("accepts the exact signed raw body and rejects tampering", () => {
    const raw = JSON.stringify({ meta: { event_name: "subscription_created" }, data: { id: "1" } });
    const signature = createHmac("sha256", "webhook-test-secret").update(raw).digest("hex");
    expect(verifyLemonSignature(raw, signature)).toBe(true);
    expect(verifyLemonSignature(`${raw} `, signature)).toBe(false);
    expect(verifyLemonSignature(raw, null)).toBe(false);
  });
});
