import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canTransitionOrder } from "@/lib/order-state";
import { restoreOrderInventory } from "@/lib/inventory";
import { createRestaurantNotification } from "@/lib/restaurant-notifications";

export type OrderTransitionResult =
  | { changed: false; reason: "ORDER_NOT_FOUND" | "FORBIDDEN" | "INVALID_TRANSITION" | "DRIVER_INVALID" | "CONFLICT" }
  | { changed: true; previous: OrderStatus; current: OrderStatus; order: { id: string; restaurantId: string; orderNumber: string; customerPhone: string; accessToken: string; driverId: string | null } };

export async function transitionOrder(input: {
  orderId: string;
  restaurantId: string;
  actorUserId: string;
  actorRoles: string[];
  next: OrderStatus;
  driverId?: string | null;
  action?: string;
}): Promise<OrderTransitionResult> {
  return prisma.$transaction(async (tx) => {
    if (!input.actorRoles.includes("SUPER_ADMIN")) {
      const membership = await tx.restaurantMember.findUnique({
        where: { userId_restaurantId: { userId: input.actorUserId, restaurantId: input.restaurantId } },
        select: { id: true },
      });
      if (!membership) return { changed: false, reason: "FORBIDDEN" };
    }

    const order = await tx.order.findFirst({
      where: { id: input.orderId, restaurantId: input.restaurantId },
      select: { id: true, restaurantId: true, status: true, driverId: true, orderNumber: true, customerPhone: true, accessToken: true },
    });
    if (!order) return { changed: false, reason: "ORDER_NOT_FOUND" };
    if (!canTransitionOrder(order.status, input.next)) return { changed: false, reason: "INVALID_TRANSITION" };

    let driverId = order.driverId;
    let driverName: string | undefined;
    if (input.next === "ASSIGNED_TO_DRIVER") {
      driverId = input.driverId ?? order.driverId;
      if (!driverId) return { changed: false, reason: "DRIVER_INVALID" };
      const driver = await tx.deliveryDriver.findFirst({ where: { id: driverId, restaurantId: input.restaurantId, status: { not: "OFFLINE" } }, select: { id: true, name: true } });
      if (!driver) return { changed: false, reason: "DRIVER_INVALID" };
      driverName = driver.name;
    }

    const updated = await tx.order.updateMany({
      where: { id: order.id, restaurantId: input.restaurantId, status: order.status },
      data: {
        status: input.next,
        ...(input.next === "ASSIGNED_TO_DRIVER" ? { driverId, driverAssignedAt: new Date() } : {}),
        ...(input.next === "OUT_FOR_DELIVERY" ? { outForDeliveryAt: new Date() } : {}),
        ...(input.next === "DELIVERED" || input.next === "COMPLETED" ? { deliveredAt: new Date() } : {}),
      },
    });
    if (updated.count !== 1) return { changed: false, reason: "CONFLICT" };

    if (input.next === "CANCELLED" || input.next === "REJECTED")
      await restoreOrderInventory(tx, order.id, input.restaurantId);

    if (input.next === "ASSIGNED_TO_DRIVER" && driverId) {
      if (order.driverId && order.driverId !== driverId)
        await tx.deliveryDriver.updateMany({ where: { id: order.driverId, restaurantId: input.restaurantId }, data: { status: "AVAILABLE" } });
      await tx.deliveryDriver.updateMany({ where: { id: driverId, restaurantId: input.restaurantId }, data: { status: "BUSY" } });
      await createRestaurantNotification(tx, { restaurantId: input.restaurantId, type: "DRIVER_ASSIGNED", title: "Driver assigned", body: driverName, href: `/order/${order.accessToken}`, dedupeKey: `driver:${order.id}:${driverId}` });
    }
    if (order.driverId && ["DELIVERED", "COMPLETED", "FAILED_DELIVERY"].includes(input.next))
      await tx.deliveryDriver.updateMany({ where: { id: order.driverId, restaurantId: input.restaurantId }, data: { status: "AVAILABLE" } });
    if (input.next === "DELIVERED")
      await createRestaurantNotification(tx, { restaurantId: input.restaurantId, type: "DELIVERY_COMPLETED", title: "Delivery completed", href: `/order/${order.accessToken}`, dedupeKey: `delivery:${order.id}` });

    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: input.next, userId: input.actorUserId } });
    await tx.orderActionLog.create({ data: { orderId: order.id, userId: input.actorUserId, action: input.action ?? "STATUS_UPDATED", details: { previous: order.status, next: input.next } as Prisma.InputJsonValue } });
    return { changed: true, previous: order.status, current: input.next, order: { id: order.id, restaurantId: order.restaurantId, orderNumber: order.orderNumber, customerPhone: order.customerPhone, accessToken: order.accessToken, driverId } };
  });
}
