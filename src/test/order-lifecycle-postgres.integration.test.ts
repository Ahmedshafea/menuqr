import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type OrderStatus } from "@prisma/client";
import { transitionOrder } from "@/lib/order-lifecycle";
import { getOrderAnalyticsSummary } from "@/lib/analytics-orders";

const suite = process.env.PHASE23_PG_TEST === "1" ? describe : describe.skip;

suite("authoritative order lifecycle on real PostgreSQL", () => {
  const db = new PrismaClient();
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let restaurantA: string, restaurantB: string, actorUserId: string, driverA: string, driverB: string, categoryA: string;

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      db.restaurant.create({ data: { name: "A", slug: `p23-a-${run}`, whatsapp: "1" } }),
      db.restaurant.create({ data: { name: "B", slug: `p23-b-${run}`, whatsapp: "2" } }),
    ]);
    restaurantA = a.id; restaurantB = b.id;
    actorUserId = `p23-user-${run}`;
    await db.$executeRaw`INSERT INTO "User" ("id", "name", "email", "passwordHash", "createdAt", "updatedAt") VALUES (${actorUserId}, 'actor', ${`p23-${run}@test.local`}, 'x', NOW(), NOW())`;
    await db.restaurantMember.create({ data: { userId: actorUserId, restaurantId: restaurantA, role: "STAFF" } });
    const [aDriver, bDriver, category] = await Promise.all([
      db.deliveryDriver.create({ data: { name: "A driver", phone: `10${Date.now()}`, restaurantId: restaurantA } }),
      db.deliveryDriver.create({ data: { name: "B driver", phone: `20${Date.now()}`, restaurantId: restaurantB } }),
      db.category.create({ data: { name: "Food", restaurantId: restaurantA } }),
    ]);
    driverA = aDriver.id; driverB = bDriver.id; categoryA = category.id;
  });

  afterAll(() => db.$disconnect());

  async function order(status: OrderStatus, tracked = false) {
    const product = tracked ? await db.product.create({ data: { name: "Tracked", price: 1, stock: 0, restaurantId: restaurantA, categoryId: categoryA } }) : null;
    const created = await db.order.create({ data: { orderNumber: `P23-${crypto.randomUUID()}`, customerName: "x", customerPhone: "1", subtotal: 1, total: 1, accessToken: `p23-${crypto.randomUUID()}`, restaurantId: restaurantA, status, items: product ? { create: { productName: product.name, unitPrice: 1, quantity: 1, productId: product.id } } : undefined } });
    return { order: created, product };
  }

  const transition = (orderId: string, next: OrderStatus, driverId?: string) => transitionOrder({ orderId, restaurantId: restaurantA, actorUserId, actorRoles: ["STAFF"], next, driverId });

  it.each(["CONFIRMED", "ASSIGNED_TO_DRIVER"] as OrderStatus[])("rejects CANCELLED to %s", async (next) => {
    const fixture = await order("CANCELLED");
    const result = await transition(fixture.order.id, next, driverA);
    expect(result).toMatchObject({ changed: false, reason: "INVALID_TRANSITION" });
    expect((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).status).toBe("CANCELLED");
  });

  it("restores inventory on cancellation exactly once", async () => {
    const fixture = await order("NEW", true);
    expect((await transition(fixture.order.id, "CANCELLED")).changed).toBe(true);
    expect(await transition(fixture.order.id, "CANCELLED")).toMatchObject({ changed: false, reason: "INVALID_TRANSITION" });
    const [savedOrder, product] = await Promise.all([db.order.findUniqueOrThrow({ where: { id: fixture.order.id } }), db.product.findUniqueOrThrow({ where: { id: fixture.product!.id } })]);
    expect(savedOrder.inventoryRestoredAt).not.toBeNull();
    expect(product.stock).toBe(1);
  });

  it("allows exactly one concurrent cancellation and restoration", async () => {
    const fixture = await order("CONFIRMED", true);
    const results = await Promise.all([transition(fixture.order.id, "CANCELLED"), transition(fixture.order.id, "CANCELLED")]);
    expect(results.filter((result) => result.changed)).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: fixture.product!.id } })).stock).toBe(1);
  });

  it("rejects cross-tenant driver assignment", async () => {
    const fixture = await order("READY");
    expect(await transition(fixture.order.id, "ASSIGNED_TO_DRIVER", driverB)).toMatchObject({ changed: false, reason: "DRIVER_INVALID" });
    expect((await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).status).toBe("READY");
  });

  it("assigns a tenant driver only from a valid state", async () => {
    const fixture = await order("READY");
    expect((await transition(fixture.order.id, "ASSIGNED_TO_DRIVER", driverA)).changed).toBe(true);
    const saved = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
    expect(saved).toMatchObject({ status: "ASSIGNED_TO_DRIVER", driverId: driverA });
  });

  it("allows only one of two concurrent valid conflicting transitions", async () => {
    const fixture = await order("CONFIRMED", true);
    const results = await Promise.all([transition(fixture.order.id, "PREPARING"), transition(fixture.order.id, "CANCELLED")]);
    expect(results.filter((result) => result.changed)).toHaveLength(1);
    const saved = await db.order.findUniqueOrThrow({ where: { id: fixture.order.id } });
    expect(["PREPARING", "CANCELLED"]).toContain(saved.status);
    expect((await db.product.findUniqueOrThrow({ where: { id: fixture.product!.id } })).stock).toBe(saved.status === "CANCELLED" ? 1 : 0);
  });

  it("keeps representative subscription, billing, OTP, and rate-limit records readable", async () => {
    const plan = await db.plan.create({ data: { code: `p23-${run}`, name: `P23 ${run}`, price: 0, maxProducts: 1, maxBranches: 1, maxStaff: 1 } });
    const subscription = await db.subscription.create({ data: { restaurantId: restaurantA, planId: plan.id, status: "ACTIVE" } });
    const intent = await db.billingCheckoutIntent.create({ data: { publicIntentId: `intent-${run}`, restaurantId: restaurantA, initiatingUserId: actorUserId, planId: plan.id, variantId: "dummy", expiresAt: new Date(Date.now() + 60_000) } });
    const otp = await db.whatsAppOtp.create({ data: { phone: `+${Date.now()}`, codeHash: "hash", expiresAt: new Date(Date.now() + 60_000) } });
    const bucket = await db.rateLimitBucket.create({ data: { key: `p23:${run}`, count: 1, resetAt: new Date(Date.now() + 60_000) } });
    expect(await db.subscription.findUnique({ where: { id: subscription.id } })).not.toBeNull();
    expect(await db.billingCheckoutIntent.findUnique({ where: { id: intent.id } })).not.toBeNull();
    expect(await db.whatsAppOtp.findUnique({ where: { id: otp.id } })).not.toBeNull();
    expect(await db.rateLimitBucket.findUnique({ where: { key: bucket.key } })).not.toBeNull();
  });

  it("allows only one order for a restaurant idempotency key", async () => {
    const clientRequestId = crypto.randomUUID();
    const create = () => db.order.create({ data: {
      orderNumber: `P23-${crypto.randomUUID()}`,
      customerName: "retry-safe",
      customerPhone: "1",
      subtotal: 1,
      total: 1,
      accessToken: `p23-${crypto.randomUUID()}`,
      restaurantId: restaurantA,
      clientRequestId,
    } });
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.order.count({ where: { restaurantId: restaurantA, clientRequestId } })).toBe(1);
  });

  it("aggregates dashboard order analytics without loading order rows", async () => {
    const start = new Date(Date.now() - 60_000);
    const deliveredAt = new Date();
    const outForDeliveryAt = new Date(deliveredAt.getTime() - 20 * 60_000);
    await db.order.create({ data: {
      orderNumber: `P23-${crypto.randomUUID()}`,
      customerName: "analytics",
      customerPhone: "1",
      subtotal: 12,
      total: 12,
      accessToken: `p23-${crypto.randomUUID()}`,
      restaurantId: restaurantA,
      status: "COMPLETED",
      fulfillmentType: "DELIVERY",
      outForDeliveryAt,
      deliveredAt,
    } });
    const summary = await getOrderAnalyticsSummary(restaurantA, start, db);
    expect(summary.byStatus.find((row) => row.status === "COMPLETED")?._count._all).toBeGreaterThanOrEqual(1);
    expect(summary.byFulfillment.find((row) => row.fulfillmentType === "DELIVERY")?._count._all).toBeGreaterThanOrEqual(1);
    expect(summary.daily.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThanOrEqual(1);
    expect(summary.averageDeliveryMinutes).toBeCloseTo(20, 0);
  });
});
