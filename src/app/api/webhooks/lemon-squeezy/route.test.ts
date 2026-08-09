import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: new Set<string>(),
  intent: null as null | Record<string, unknown>,
  subscription: null as null | Record<string, unknown>,
  creates: [] as Array<Record<string, unknown>>,
}));

const tx = vi.hoisted(() => ({
  billingEvent: { create: vi.fn(async ({ data }: { data: { providerEventId: string } }) => {
    if (state.events.has(data.providerEventId)) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    state.events.add(data.providerEventId);
    return data;
  }) },
  billingCheckoutIntent: {
    findUnique: vi.fn(async () => state.intent),
    updateMany: vi.fn(async () => {
      const intent = state.intent as Record<string, unknown> | null;
      if (!intent || intent.status !== "PENDING" || intent.consumedAt || (intent.expiresAt as Date) <= new Date()) return { count: 0 };
      intent.status = "CONSUMED";
      intent.consumedAt = new Date();
      return { count: 1 };
    }),
  },
  restaurantMember: { findUnique: vi.fn(async () => ({ role: "RESTAURANT_OWNER" })) },
  plan: { findFirst: vi.fn(async () => ({ id: "plan-a", price: 100 })) },
  subscription: {
    findUnique: vi.fn(async () => state.subscription),
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.creates.push(data); state.subscription = { id: "local-sub", provider: "LEMON_SQUEEZY", plan: { lemonSqueezyVariantId: "variant-a" }, ...data }; return data; }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.subscription = { ...state.subscription, ...data }; return state.subscription; }),
  },
  payment: { upsert: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } }));
vi.mock("@/lib/api", () => ({
  apiError: (code: string, status: number) => Response.json({ code }, { status }),
  logApiError: vi.fn(),
}));

import { POST } from "./route";

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: "intent-db-id", publicIntentId: "intent-public", restaurantId: "restaurant-a", initiatingUserId: "owner-a",
    planId: "plan-a", variantId: "variant-a", status: "PENDING", consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
    initiatingUser: { isActive: true }, plan: { id: "plan-a", isActive: true, price: 100, lemonSqueezyVariantId: "variant-a" }, ...overrides,
  };
}

function payload(eventName = "subscription_created", overrides: Record<string, unknown> = {}) {
  return {
    meta: { event_name: eventName, custom_data: { checkout_intent_id: "intent-public", restaurant_id: "restaurant-b", user_id: "attacker", plan_id: "plan-b" } },
    data: { type: "subscriptions", id: "provider-sub-1", attributes: {
      store_id: "store-1", test_mode: false, variant_id: "variant-a", status: "active", customer_id: 4, order_id: 5,
      created_at: "2026-08-08T10:00:00.000Z", updated_at: "2026-08-08T10:00:00.000Z", ...overrides,
    } },
  };
}

async function send(body: object) {
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", "test-secret").update(raw).digest("hex");
  return POST(new Request("http://localhost/api/webhooks/lemon-squeezy", { method: "POST", body: raw, headers: { "x-signature": signature } }));
}

describe("Lemon Squeezy billing trust boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.events.clear(); state.creates.length = 0; state.intent = intent(); state.subscription = null;
    vi.stubEnv("LEMON_SQUEEZY_WEBHOOK_SECRET", "test-secret"); vi.stubEnv("LEMON_SQUEEZY_STORE_ID", "store-1"); vi.stubEnv("NODE_ENV", "production");
  });

  it("uses the server intent tenant and ignores substituted custom tenant data", async () => {
    const response = await send(payload());
    expect(response.status).toBe(200);
    expect(state.creates).toHaveLength(1);
    expect(state.creates[0]).toMatchObject({ restaurantId: "restaurant-a", planId: "plan-a", providerVariantId: "variant-a" });
  });

  it.each([
    ["expired", () => { state.intent = intent({ expiresAt: new Date(Date.now() - 1) }); }],
    ["reused", () => { state.intent = intent({ status: "CONSUMED", consumedAt: new Date() }); }],
    ["owner removed", () => { tx.restaurantMember.findUnique.mockResolvedValueOnce(null as never); }],
  ])("rejects an %s checkout intent", async (_label, arrange) => {
    arrange();
    expect((await send(payload())).status).toBe(422);
    expect(state.creates).toHaveLength(0);
  });

  it("rejects a valid signature from the wrong store", async () => {
    expect((await send(payload("subscription_created", { store_id: "store-2" }))).status).toBe(422);
    expect(state.creates).toHaveLength(0);
  });

  it("rejects test-mode billing on the production endpoint", async () => {
    expect((await send(payload("subscription_created", { test_mode: true }))).status).toBe(422);
    expect(state.creates).toHaveLength(0);
  });

  it("rejects a provider variant that differs from the intent and plan", async () => {
    expect((await send(payload("subscription_created", { variant_id: "variant-b" }))).status).toBe(422);
    expect(state.creates).toHaveLength(0);
  });

  it("records but does not mutate an unsupported subscription event", async () => {
    const response = await send(payload("subscription_plan_changed"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: "ignored" });
    expect(state.creates).toHaveLength(0);
  });

  it("makes duplicate deliveries harmless and activates exactly once", async () => {
    const body = payload();
    expect((await send(body)).status).toBe(200);
    expect((await send(body)).status).toBe(200);
    expect(state.creates).toHaveLength(1);
  });

  it("does not let an older or equal timestamp overwrite newer subscription state", async () => {
    state.subscription = { id: "local-sub", provider: "LEMON_SQUEEZY", providerVariantId: "variant-a", providerUpdatedAt: new Date("2026-08-08T12:00:00.000Z") };
    const response = await send(payload("subscription_updated", { updated_at: "2026-08-08T11:00:00.000Z", status: "expired" }));
    expect(response.status).toBe(200);
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });
});
