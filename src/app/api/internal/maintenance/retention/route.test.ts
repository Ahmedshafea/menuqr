import { beforeEach, describe, expect, it, vi } from "vitest";

const cleanup = vi.hoisted(() => vi.fn());
vi.mock("@/lib/operational-retention", () => ({ cleanupOperationalRecords: cleanup }));
import { POST } from "./route";

const request = (secret?: string) => new Request("http://localhost/api/internal/maintenance/retention", {
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
});

describe("retention maintenance endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    cleanup.mockResolvedValue({ rateLimitBuckets: 1, whatsAppOtps: 2, importLeases: 3 });
  });

  it.each([undefined, "wrong-secret", ""])('rejects missing or invalid credentials (%s)', async (secret) => {
    expect((await POST(request(secret))).status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("invokes the bounded cleanup with no caller-controlled arguments", async () => {
    const response = await POST(request("test-cron-secret"));
    expect(response.status).toBe(200);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith();
  });

  it("can be invoked repeatedly", async () => {
    await POST(request("test-cron-secret"));
    await POST(request("test-cron-secret"));
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("returns a stable error when cleanup fails", async () => {
    cleanup.mockRejectedValue(new Error("database diagnostic"));
    const response = await POST(request("test-cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "RETENTION_CLEANUP_FAILED", details: { requestId: expect.any(String) } } });
  });
});
