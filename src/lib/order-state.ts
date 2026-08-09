import type { OrderStatus } from "@prisma/client";

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ["CONFIRMED", "CANCELLED", "REJECTED"],
  CONFIRMED: ["PREPARING", "CANCELLED", "REJECTED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["ASSIGNED_TO_DRIVER", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"],
  ASSIGNED_TO_DRIVER: ["OUT_FOR_DELIVERY", "CANCELLED", "FAILED_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_DELIVERY"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [], CANCELLED: [], REJECTED: [], FAILED_DELIVERY: [],
};

export function canTransitionOrder(current: OrderStatus, next: OrderStatus) {
  return transitions[current].includes(next);
}
