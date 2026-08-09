import { describe, expect, it } from "vitest";
import { OrderStatus } from "@prisma/client";
import { canTransitionOrder } from "@/lib/order-state";

describe("order state machine", () => {
  it("allows the operational forward path", () => {
    const path: OrderStatus[] = ["NEW", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"];
    for (let index = 0; index < path.length - 1; index++) {
      expect(canTransitionOrder(path[index], path[index + 1])).toBe(true);
    }
  });

  it("rejects repeats, backwards transitions, and all terminal exits", () => {
    expect(canTransitionOrder("PREPARING", "CONFIRMED")).toBe(false);
    for (const terminal of ["COMPLETED", "CANCELLED", "REJECTED", "FAILED_DELIVERY"] as OrderStatus[]) {
      expect(canTransitionOrder(terminal, "NEW")).toBe(false);
      expect(canTransitionOrder(terminal, terminal)).toBe(false);
    }
  });
});
