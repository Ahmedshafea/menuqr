import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function requireManagedOrder(accessToken: string) {
  const session = await auth();
  if (!session) throw new Error("UNAUTHORIZED");
  const order = await prisma.order.findUnique({
    where: { accessToken },
    select: { id: true, restaurantId: true, accessToken: true },
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
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { unitPrice: true, quantity: true, isComplimentary: true },
  });
  const total = items.reduce(
    (sum, item) =>
      sum +
      (item.isComplimentary ? 0 : Number(item.unitPrice) * item.quantity),
    0,
  );
  await tx.order.update({
    where: { id: orderId },
    data: { subtotal: total, total },
  });
  return total;
}
