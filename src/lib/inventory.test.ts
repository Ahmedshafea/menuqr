import { describe, expect, it } from "vitest";
import { aggregateCartQuantities, reserveInventory } from "./inventory";

function stockTransaction(initial: number) {
  let stock = initial;
  const tx = { product: { updateMany: async ({ where, data }: { where: { stock: { gte: number } }; data: { stock: { decrement: number } } }) => {
    await Promise.resolve();
    if (stock < where.stock.gte) return { count: 0 };
    stock -= data.stock.decrement;
    return { count: 1 };
  } } };
  return { tx, stock: () => stock };
}

describe("atomic inventory reservation", () => {
  it("aggregates duplicate cart lines before reserving", () => {
    expect(aggregateCartQuantities([{ productId: "a", quantity: 3 }, { productId: "a", quantity: 3 }]).get("a")).toBe(6);
  });
  it("rejects duplicate lines whose aggregate exceeds stock", async () => {
    const db = stockTransaction(5);
    await expect(reserveInventory(db.tx as never, "r", new Map([["a", 6]]), new Set(["a"]))).rejects.toThrow("INVENTORY_CONFLICT");
    expect(db.stock()).toBe(5);
  });
  it("allows only one of two concurrent claims for the final unit", async () => {
    const db = stockTransaction(1);
    const results = await Promise.allSettled([
      reserveInventory(db.tx as never, "r", new Map([["a", 1]]), new Set(["a"])),
      reserveInventory(db.tx as never, "r", new Map([["a", 1]]), new Set(["a"])),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(db.stock()).toBe(0);
  });
});
