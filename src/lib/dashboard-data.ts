import { startOfDay, startOfMonth, startOfYear } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function getDashboardData(restaurantId: string) {
  const now = new Date(); const day = startOfDay(now); const month = startOfMonth(now); const year = startOfYear(now);
  const [restaurant, todayByStatus, monthRevenue, yearRevenue, products, categories, events, recentOrders, topProducts, recentCustomers] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, logoUrl: true, slug: true, currency: true } }),
    prisma.order.groupBy({ by: ["status"], where: { restaurantId, createdAt: { gte: day } }, orderBy: { status: "asc" }, _count: { _all: true }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { restaurantId, status: "COMPLETED", createdAt: { gte: month } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { restaurantId, status: "COMPLETED", createdAt: { gte: year } }, _sum: { total: true } }),
    prisma.product.groupBy({ by: ["isAvailable"], where: { restaurantId }, orderBy: { isAvailable: "asc" }, _count: { _all: true } }),
    prisma.category.count({ where: { restaurantId } }),
    prisma.analyticsEvent.groupBy({ by: ["type"], where: { restaurantId }, orderBy: { type: "asc" }, _count: { _all: true } }),
    prisma.order.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, orderNumber: true, customerName: true, total: true, status: true, createdAt: true, _count: { select: { items: true } } } }),
    prisma.orderItem.groupBy({ by: ["productName"], where: { order: { restaurantId, status: { not: "CANCELLED" } } }, _sum: { quantity: true }, _count: { _all: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
    prisma.order.findMany({ where: { restaurantId }, distinct: ["customerPhone"], orderBy: { createdAt: "desc" }, take: 5, select: { customerName: true, customerPhone: true, createdAt: true, _count: { select: { items: true } } } })
  ]);
  const status = Object.fromEntries(todayByStatus.map(row => [row.status, row._count?._all ?? 0]));
  const productCounts = Object.fromEntries(products.map(row => [String(row.isAvailable), row._count?._all ?? 0]));
  const eventCounts = Object.fromEntries(events.map(row => [row.type, row._count?._all ?? 0]));
  return { restaurant, todayOrders: todayByStatus.reduce((sum,row)=>sum+(row._count?._all??0),0), pendingOrders: status.PENDING??0, completedOrders: status.COMPLETED??0, cancelledOrders: status.CANCELLED??0, revenueToday: todayByStatus.filter(row=>row.status==="COMPLETED").reduce((sum,row)=>sum+Number(row._sum?.total??0),0), revenueMonth:Number(monthRevenue._sum.total??0), revenueYear:Number(yearRevenue._sum.total??0), totalProducts:(productCounts.true??0)+(productCounts.false??0), activeProducts:productCounts.true??0, hiddenProducts:productCounts.false??0, categories, qrScans:eventCounts.QR_SCAN??0, menuViews:eventCounts.MENU_VIEW??0, recentOrders, topProducts, recentCustomers };
}
