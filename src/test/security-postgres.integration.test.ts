import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { adjustInventory, restoreOrderInventory } from "@/lib/inventory";
import { assertTenantQuota } from "@/lib/quota";

vi.mock("@/lib/platform-config", () => ({ isFeatureFlagEnabled: async () => true }));

const enabled = process.env.PHASE21_PG_TEST === "1";
const suite = enabled ? describe : describe.skip;

suite("Phase 2.1 real PostgreSQL security", () => {
  const db = new PrismaClient();
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let restaurantA: string, restaurantB: string, categoryA: string, productA: string, orderA: string;

  beforeAll(async () => {
    const plan = await db.plan.create({ data: { code: `p21-${run}`, name: `Phase 21 ${run}`, price: 0, maxProducts: 2, maxBranches: 2, maxStaff: 2 } });
    for (const key of ["PRODUCT_LIMIT", "BRANCH_LIMIT", "TEAM_MEMBER_LIMIT"]) {
      const feature = await db.feature.upsert({ where: { key }, create: { key, name: key, valueType: "NUMBER" }, update: {} });
      await db.planFeature.create({ data: { planId: plan.id, featureId: feature.id, value: 2 } });
    }
    const [a, b] = await Promise.all([
      db.restaurant.create({ data: { name: "A", slug: `p21-a-${run}`, whatsapp: "1", subscriptions: { create: { planId: plan.id, status: "ACTIVE" } } } }),
      db.restaurant.create({ data: { name: "B", slug: `p21-b-${run}`, whatsapp: "2", subscriptions: { create: { planId: plan.id, status: "ACTIVE" } } } }),
    ]);
    restaurantA = a.id; restaurantB = b.id;
    const category = await db.category.create({ data: { name: "Food", restaurantId: restaurantA } });
    categoryA = category.id;
    const product = await db.product.create({ data: { name: "Tracked", price: 10, stock: 2, restaurantId: restaurantA, categoryId: category.id } });
    productA = product.id;
    const order = await db.order.create({ data: { orderNumber: `P21-${run}`, customerName: "Test", customerPhone: "1", subtotal: 10, total: 10, accessToken: `p21-token-${run}`, restaurantId: restaurantA, items: { create: { productName: "Tracked", unitPrice: 10, quantity: 1, productId: product.id } } } });
    orderA = order.id;
  }, 30_000);

  afterAll(async () => { await db.$disconnect(); });

  it("allows only one concurrent claim for the final inventory unit", async () => {
    await db.product.update({ where: { id: productA }, data: { stock: 1 } });
    const results = await Promise.allSettled([1, 2].map(() => db.$transaction((tx) => adjustInventory(tx, restaurantA, productA, 1))));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: productA } })).stock).toBe(0);
  });

  it("rejects cross-tenant inventory and rolls back deliberate failures", async () => {
    await expect(db.$transaction((tx) => adjustInventory(tx, restaurantB, productA, 1))).rejects.toThrow("INVENTORY_PRODUCT_INVALID");
    await db.product.update({ where: { id: productA }, data: { stock: 2 } });
    await expect(db.$transaction(async (tx) => { await adjustInventory(tx, restaurantA, productA, 1); throw new Error("DELIBERATE"); })).rejects.toThrow("DELIBERATE");
    expect((await db.product.findUniqueOrThrow({ where: { id: productA } })).stock).toBe(2);
  });

  it("restores cancelled-order inventory exactly once", async () => {
    await db.order.update({ where: { id: orderA }, data: { inventoryRestoredAt: null } });
    await db.product.update({ where: { id: productA }, data: { stock: 0 } });
    const results = await Promise.all([1, 2].map(() => db.$transaction((tx) => restoreOrderInventory(tx, orderA, restaurantA))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: productA } })).stock).toBe(1);
  });

  it.each(["branch", "product", "member"] as const)("enforces the %s quota under concurrency", async (kind) => {
    const attempts = Array.from({ length: 5 }, (_, index) => db.$transaction(async (tx) => {
      if (kind === "branch") {
        await assertTenantQuota(tx, restaurantA, "BRANCH_LIMIT", () => tx.branch.count({ where: { restaurantId: restaurantA } }));
        return tx.branch.create({ data: { name: `B${index}`, slug: `b-${index}`, address: "x", restaurantId: restaurantA } });
      }
      if (kind === "product") {
        await assertTenantQuota(tx, restaurantA, "PRODUCT_LIMIT", () => tx.product.count({ where: { restaurantId: restaurantA } }));
        return tx.product.create({ data: { name: `P${index}`, price: 1, restaurantId: restaurantA, categoryId: categoryA } });
      }
      await assertTenantQuota(tx, restaurantA, "TEAM_MEMBER_LIMIT", () => tx.restaurantMember.count({ where: { restaurantId: restaurantA } }));
      const userId = `p21-user-${run}-${index}`;
      await tx.$executeRaw`INSERT INTO "User" ("id", "name", "email", "passwordHash", "createdAt", "updatedAt") VALUES (${userId}, ${`U${index}`}, ${`p21-${run}-${index}@test.local`}, 'x', NOW(), NOW())`;
      return tx.restaurantMember.create({ data: { userId, restaurantId: restaurantA } });
    }));
    const results = await Promise.allSettled(attempts);
    const expected = kind === "product" ? 1 : 2; // the tracked fixture already consumes one product slot.
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled, results.map((result) => result.status === "rejected" ? String(result.reason) : "ok").join("\n")).toHaveLength(expected);
  }, 30_000);

  it("keeps quota locks isolated between restaurants", async () => {
    const create = (restaurantId: string) => db.$transaction(async (tx) => {
      await assertTenantQuota(tx, restaurantId, "BRANCH_LIMIT", () => tx.branch.count({ where: { restaurantId } }));
      return tx.branch.create({ data: { name: "isolated", slug: "isolated", address: "x", restaurantId } });
    });
    await db.branch.deleteMany({ where: { restaurantId: { in: [restaurantA, restaurantB] } } });
    const results = await Promise.allSettled([create(restaurantA), create(restaurantB)]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
  });
});
