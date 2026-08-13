import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), findFirst: vi.fn(), send: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock("@/lib/current-authorization", () => ({ authorizeTenantApi: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { order: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/whatsapp", () => ({ sendOrderStatusNotification: mocks.send, WhatsAppError: class extends Error {} }));

import { POST } from "@/app/api/whatsapp/notifications/route";

const orderId = "cm12345678901234567890123";
const request = (body: unknown) => new Request("http://localhost/api/whatsapp/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("purpose-bound WhatsApp notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ ok: true, restaurantId: "tenant-a", session: { user: { id: "user-a" } } });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.findFirst.mockResolvedValue({ id: orderId, orderNumber: "1", customerPhone: "+20100", accessToken: "token", status: "READY", restaurant: { name: "A", nameAr: null, locale: "en" } });
    mocks.send.mockResolvedValue({ sent: true });
  });

  it.each(["STAFF", "RESTAURANT_OWNER", "SUPER_ADMIN"])("allows an authorized %s tenant order", async (role) => {
    mocks.access.mockResolvedValue({ ok: true, restaurantId: "tenant-a", session: { user: { id: "user-a", roles: [role] } } });
    expect((await POST(request({ orderId, status: "READY" }))).status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: orderId, restaurantId: "tenant-a", status: "READY" } }));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ customerPhone: "+20100", orderId }));
  });

  it("fails closed without a valid tenant session", async () => {
    mocks.access.mockResolvedValue({ ok: false, response: Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) });
    expect((await POST(request({ orderId, status: "READY" }))).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("denies wrong-tenant, missing, or deleted orders", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await POST(request({ orderId, status: "READY" }))).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { orderId, status: "READY", phone: "+1999" },
    { orderId, status: "READY", variables: { secret: "inject" } },
    { orderId, status: "READY", customerId: "cm12345678901234567890123" },
    { orderId, status: "NEW" },
  ])("rejects client-controlled recipient/content/type: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
