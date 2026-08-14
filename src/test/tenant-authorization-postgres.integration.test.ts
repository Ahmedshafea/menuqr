import { beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string; roles: string[]; restaurantId: string | null } } }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => state.session) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
  forbidden: vi.fn(() => { throw new Error("FORBIDDEN"); }),
}));

import { requireOwner, requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { consumeOtp, hashOtp } from "@/lib/otp";
import { rateLimit } from "@/lib/rate-limit";
import { requireSuperAdmin } from "@/lib/super-admin";
import { beginImportOperation } from "@/lib/import-guard";
import { cleanupOperationalRecords } from "@/lib/operational-retention";

const suite = process.env.PHASE241_PG_TEST === "1" ? describe : describe.skip;

suite("Phase 2.4.1 live tenant authorization on PostgreSQL", () => {
  const db = prisma;
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let userId: string;
  let restaurantA: string;
  let restaurantB: string;

  beforeAll(async () => {
    process.env.OTP_HASH_SECRET = "phase241-disposable-postgres-test-secret";
    const [a, b] = await Promise.all([
      db.restaurant.create({ data: { name: "P241 A", slug: `p241-a-${run}`, whatsapp: "1" } }),
      db.restaurant.create({ data: { name: "P241 B", slug: `p241-b-${run}`, whatsapp: "2" } }),
    ]);
    restaurantA = a.id;
    restaurantB = b.id;
    const user = await db.user.create({
      data: {
        name: "P241 User",
        email: `p241-${run}@test.local`,
        passwordHash: "x",
        roles: { create: { role: "STAFF" } },
        restaurantMemberships: { create: { restaurantId: restaurantA, role: "STAFF" } },
      },
    });
    userId = user.id;
    state.session = { user: { id: userId, roles: ["STAFF"], restaurantId: restaurantA } };
  });

  it("allows an active STAFF membership", async () => {
    await expect(requireTenant()).resolves.toMatchObject({ restaurantId: restaurantA, membershipRole: "STAFF" });
  });

  it("denies the same stale STAFF session immediately after membership removal", async () => {
    await db.restaurantMember.delete({ where: { userId_restaurantId: { userId, restaurantId: restaurantA } } });
    await expect(requireTenant()).rejects.toThrow("FORBIDDEN");
  });

  it("enforces a current membership role change", async () => {
    await db.restaurantMember.create({ data: { userId, restaurantId: restaurantA, role: "RESTAURANT_OWNER" } });
    await expect(requireOwner()).resolves.toMatchObject({ restaurantId: restaurantA });
    await db.restaurantMember.update({ where: { userId_restaurantId: { userId, restaurantId: restaurantA } }, data: { role: "STAFF" } });
    await expect(requireOwner()).rejects.toThrow("FORBIDDEN");
    await expect(requireTenant()).resolves.toMatchObject({ membershipRole: "STAFF" });
  });

  it("rejects a membership that belongs only to another tenant", async () => {
    await db.restaurantMember.deleteMany({ where: { userId } });
    await db.restaurantMember.create({ data: { userId, restaurantId: restaurantB, role: "STAFF" } });
    state.session = { user: { id: userId, roles: ["STAFF"], restaurantId: restaurantA } };
    await expect(requireTenant()).rejects.toThrow("FORBIDDEN");
  });

  it("preserves a current SUPER_ADMIN without tenant membership", async () => {
    await db.userRole.upsert({ where: { userId_role: { userId, role: "SUPER_ADMIN" } }, create: { userId, role: "SUPER_ADMIN" }, update: {} });
    state.session = { user: { id: userId, roles: ["SUPER_ADMIN"], restaurantId: restaurantA } };
    await expect(requireTenant()).resolves.toMatchObject({ globalRoles: expect.arrayContaining(["SUPER_ADMIN"]), membershipRole: null });
  });

  it("immediately rejects a disabled user and a removed SUPER_ADMIN role", async () => {
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
    await expect(requireTenant()).rejects.toThrow("FORBIDDEN");
    await expect(requireSuperAdmin()).rejects.toThrow("FORBIDDEN");
    await db.user.update({ where: { id: userId }, data: { isActive: true } });
    await db.userRole.delete({ where: { userId_role: { userId, role: "SUPER_ADMIN" } } });
    await expect(requireSuperAdmin()).rejects.toThrow("FORBIDDEN");
    await db.userRole.create({ data: { userId, role: "SUPER_ADMIN" } });
    await expect(requireSuperAdmin()).resolves.toMatchObject({ user: { id: userId } });
  });

  it("increments sessionVersion exactly once with an atomic password mutation", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true, passwordHash: true } });
    await db.user.update({ where: { id: userId }, data: { passwordHash: "changed", sessionVersion: { increment: 1 } } });
    const after = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true, passwordHash: true } });
    expect(after).toEqual({ sessionVersion: before.sessionVersion + 1, passwordHash: "changed" });
    await expect(db.user.update({ where: { id: "missing-user" }, data: { passwordHash: "never", sessionVersion: { increment: 1 } } })).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).sessionVersion).toBe(after.sessionVersion);
  });

  it("enforces distributed import concurrency and tenant isolation", async () => {
    const first = await beginImportOperation(userId, restaurantA, "test");
    expect(first.allowed).toBe(true);
    const blocked = await beginImportOperation(userId, restaurantA, "test");
    expect(blocked).toMatchObject({ allowed: false, reason: "concurrent" });
    const other = await beginImportOperation(`${userId}-other`, restaurantB, "test");
    expect(other.allowed).toBe(true);
    if (first.allowed) await first.release();
    if (other.allowed) await other.release();
  });

  it("enforces independent per-user and per-tenant import rates", async () => {
    const rateRestaurant = (await db.restaurant.create({ data: { name: "Import Rate", slug: `import-rate-${run}`, whatsapp: "3" } })).id;
    for (let index = 0; index < 6; index++) {
      const operation = await beginImportOperation(`rate-user-${run}`, rateRestaurant, "test");
      expect(operation.allowed).toBe(true);
      if (operation.allowed) await operation.release();
    }
    await expect(beginImportOperation(`rate-user-${run}`, rateRestaurant, "test")).resolves.toMatchObject({ allowed: false, reason: "rate" });

    const tenantRestaurant = (await db.restaurant.create({ data: { name: "Tenant Rate", slug: `tenant-rate-${run}`, whatsapp: "4" } })).id;
    for (let index = 0; index < 12; index++) {
      const operation = await beginImportOperation(`tenant-user-${run}-${index}`, tenantRestaurant, "test");
      expect(operation.allowed).toBe(true);
      if (operation.allowed) await operation.release();
    }
    await expect(beginImportOperation(`tenant-user-${run}-blocked`, tenantRestaurant, "test")).resolves.toMatchObject({ allowed: false, reason: "rate" });
  });

  it("cleans expired operational records in repeatable batches and preserves active records", async () => {
    const expiredRate = `cleanup-expired:${run}`;
    const activeRate = `cleanup-active:${run}`;
    await db.$executeRaw`INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt") VALUES (${expiredRate}, 1, NOW() - INTERVAL '2 hours', NOW()), (${activeRate}, 1, NOW() + INTERVAL '1 hour', NOW())`;
    const expiredPhone = `+cleanup${Date.now()}`;
    const validPhone = `${expiredPhone}1`;
    const billing = await db.billingEvent.create({ data: { provider: "test", providerEventId: `retention-${run}`, eventName: "test" } });
    const audit = await db.auditLog.create({ data: { action: "RETENTION_TEST", entity: "Test", entityId: run } });
    await db.$executeRaw`INSERT INTO "WhatsAppOtp" ("id", "phone", "codeHash", "expiresAt", "attempts", "createdAt", "updatedAt") VALUES (${`old-${run}`}, ${expiredPhone}, 'x', NOW() - INTERVAL '2 days', 0, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'), (${`valid-${run}`}, ${validPhone}, 'x', NOW() + INTERVAL '1 hour', 0, NOW(), NOW())`;
    const first = await cleanupOperationalRecords();
    const second = await cleanupOperationalRecords();
    expect(first.rateLimitBuckets).toBeGreaterThanOrEqual(1);
    expect(first.whatsAppOtps).toBeGreaterThanOrEqual(1);
    expect(second).toMatchObject({ rateLimitBuckets: 0, whatsAppOtps: 0 });
    expect(await db.rateLimitBucket.findUnique({ where: { key: activeRate } })).not.toBeNull();
    expect(await db.whatsAppOtp.findUnique({ where: { phone: validPhone } })).not.toBeNull();
    expect(await db.billingEvent.findUnique({ where: { id: billing.id } })).not.toBeNull();
    expect(await db.auditLog.findUnique({ where: { id: audit.id } })).not.toBeNull();
  });

  it("bounds deterministic import-lease cleanup and preserves active leases", async () => {
    const prefix = `p33-batch-${run}`;
    const expiredAt = new Date(Date.now() - 60_000);
    await db.importOperationLease.deleteMany();
    await db.importOperationLease.createMany({ data: Array.from({ length: 501 }, (_, index) => ({
      key: `${prefix}-${String(index).padStart(3, "0")}`,
      userId: `batch-user-${index}`,
      restaurantId: `batch-restaurant-${index}`,
      expiresAt: expiredAt,
    })) });
    const activeKey = `${prefix}-active`;
    await db.importOperationLease.create({ data: { key: activeKey, userId: "active-user", restaurantId: "active-restaurant", expiresAt: new Date(Date.now() + 60 * 60_000) } });
    await db.$executeRaw`UPDATE "ImportOperationLease" SET "expiresAt" = NOW() + INTERVAL '1 hour' WHERE "key" = ${activeKey}`;

    const first = await cleanupOperationalRecords(500);
    expect(first.importLeases).toBe(500);
    expect(await db.importOperationLease.count({ where: { key: { startsWith: prefix }, expiresAt: { lt: new Date() } } })).toBe(1);
    expect(await db.importOperationLease.findUnique({ where: { key: activeKey } })).not.toBeNull();

    const second = await cleanupOperationalRecords(500);
    expect(second.importLeases).toBe(1);
    expect(await db.importOperationLease.count({ where: { key: { startsWith: prefix }, expiresAt: { lt: new Date() } } })).toBe(0);
    expect((await cleanupOperationalRecords(500)).importLeases).toBe(0);
  });

  it("coordinates concurrent bounded cleanup workers with SKIP LOCKED", async () => {
    const prefix = `p33-concurrent-${run}`;
    await db.importOperationLease.createMany({ data: Array.from({ length: 800 }, (_, index) => ({
      key: `${prefix}-${String(index).padStart(3, "0")}`,
      userId: `concurrent-user-${index}`,
      restaurantId: `concurrent-restaurant-${index}`,
      expiresAt: new Date(Date.now() - 60_000),
    })) });
    const [left, right] = await Promise.all([cleanupOperationalRecords(500), cleanupOperationalRecords(500)]);
    expect(left.importLeases).toBeLessThanOrEqual(500);
    expect(right.importLeases).toBeLessThanOrEqual(500);
    expect(left.importLeases + right.importLeases).toBe(800);
    expect(await db.importOperationLease.count({ where: { key: { startsWith: prefix } } })).toBe(0);
  });

  it("rejects unsafe cleanup batch sizes", async () => {
    await expect(cleanupOperationalRecords(0)).rejects.toThrow(RangeError);
    await expect(cleanupOperationalRecords(501)).rejects.toThrow(RangeError);
    await expect(cleanupOperationalRecords(1.5)).rejects.toThrow(RangeError);
  });

  it("allows only one concurrent consumer of an OTP", async () => {
    const phone = `+241${Date.now()}`;
    const code = "123456";
    await db.whatsAppOtp.create({ data: { phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + 60_000) } });
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeOtp(phone, code)));
    expect(results.filter((result) => result === "verified")).toHaveLength(1);
  });

  it("keeps the PostgreSQL rate-limit increment atomic", async () => {
    const key = `p241-rate:${run}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit(key, 7, 60_000)));
    expect(results.filter((result) => result.allowed)).toHaveLength(7);
    expect((await db.rateLimitBucket.findUniqueOrThrow({ where: { key } })).count).toBe(20);
  });
});
