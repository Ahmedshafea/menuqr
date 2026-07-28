import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { calculateOrderPricing } from "@/lib/order-pricing";

export async function requireManagedOrder(accessToken: string) {
  const session = await auth();
  if (!session) throw new Error("UNAUTHORIZED");
  const order = await prisma.order.findUnique({
    where: { accessToken },
    select: {
      id: true,
      restaurantId: true,
      accessToken: true,
      status: true,
      driverId: true,
      customerPhone: true,
      orderNumber: true,
      restaurant: {
        select: {
          name: true,
          nameAr: true,
          locale: true,
        },
      },
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const superAdmin = session.user.roles.includes("SUPER_ADMIN");
  const membership = superAdmin
    ? true
    : Boolean(
        await prisma.restaurantMember.findUnique({
          where: {
            userId_restaurantId: {
              userId: session.user.id,
              restaurantId: order.restaurantId,
            },
          },
          select: { id: true },
        }),
      );
  if (!membership) throw new Error("FORBIDDEN");
  return { order, session };
}

export async function recalculateOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      fulfillmentType: true,
      restaurant: {
        select: {
          settings: {
            select: {
              deliveryFee: true,
              deliveryFeeType: true,
              serviceFee: true,
              serviceFeeType: true,
              taxRate: true,
              taxType: true,
              discountValue: true,
              discountType: true,
            },
          },
        },
      },
      items: {
        select: { unitPrice: true, quantity: true, isComplimentary: true },
      },
    },
  });
  const subtotal = order.items.reduce(
    (sum, item) =>
      sum +
      (item.isComplimentary ? 0 : Number(item.unitPrice) * item.quantity),
    0,
  );
  const pricing = calculateOrderPricing(
    subtotal,
    order.fulfillmentType,
    order.restaurant.settings
      ? {
          ...order.restaurant.settings,
          deliveryFee: Number(order.restaurant.settings.deliveryFee),
          serviceFee: Number(order.restaurant.settings.serviceFee),
          taxRate: Number(order.restaurant.settings.taxRate),
          discountValue: Number(order.restaurant.settings.discountValue),
        }
      : {},
  );
  await tx.order.update({
    where: { id: orderId },
    data: pricing,
  });
  return pricing.total;
}
