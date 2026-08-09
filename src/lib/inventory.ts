import type { Prisma } from "@prisma/client";

export function aggregateCartQuantities(items: Array<{ productId: string; quantity: number }>) {
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  return quantities;
}

export async function reserveInventory(tx: Prisma.TransactionClient, restaurantId: string, quantities: Map<string, number>, trackedProductIds: Set<string>) {
  for (const [productId, quantity] of quantities) {
    if (!trackedProductIds.has(productId)) continue;
    const reserved = await tx.product.updateMany({ where: { id: productId, restaurantId, availability: "AVAILABLE", stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
    if (reserved.count !== 1) throw new Error("INVENTORY_CONFLICT");
  }
}

export async function adjustInventory(tx: Prisma.TransactionClient, restaurantId: string, productId: string | null, delta: number) {
  if (!productId || delta === 0) return;
  const product = await tx.product.findFirst({ where: { id: productId, restaurantId }, select: { stock: true } });
  if (!product) throw new Error("INVENTORY_PRODUCT_INVALID");
  if (product.stock === null) return;
  if (delta > 0) {
    const reserved = await tx.product.updateMany({ where: { id: productId, restaurantId, availability: "AVAILABLE", stock: { gte: delta } }, data: { stock: { decrement: delta } } });
    if (reserved.count !== 1) throw new Error("INVENTORY_CONFLICT");
  } else {
    await tx.product.update({ where: { id: productId }, data: { stock: { increment: -delta } } });
  }
}

export async function restoreOrderInventory(tx: Prisma.TransactionClient, orderId: string, restaurantId: string) {
  const claimed = await tx.order.updateMany({ where: { id: orderId, restaurantId, inventoryRestoredAt: null }, data: { inventoryRestoredAt: new Date() } });
  if (claimed.count !== 1) return false;
  const items = await tx.orderItem.findMany({ where: { orderId, productId: { not: null } }, select: { productId: true, quantity: true } });
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.productId!, (quantities.get(item.productId!) || 0) + item.quantity);
  for (const [productId, quantity] of quantities) await adjustInventory(tx, restaurantId, productId, -quantity);
  return true;
}
