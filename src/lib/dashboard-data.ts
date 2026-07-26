import { startOfDay, startOfMonth, startOfYear } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function getDashboardData(restaurantId: string) {
  const now = new Date();
  const day = startOfDay(now);
  const month = startOfMonth(now);
  const year = startOfYear(now);

  const [
    restaurant,
    todayByStatus,
    monthRevenue,
    yearRevenue,
    products,
    categories,
    events,
    recentOrders,
    rawTopProducts,
    recentCustomers,
    workingHours,
  ] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: {
        name: true,
        logoUrl: true,
        slug: true,
        currency: true,
        description: true,
        descriptionAr: true,
        address: true,
        whatsapp: true,
        settings: { select: { setupChecklistDismissed: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { restaurantId, createdAt: { gte: day } },
      orderBy: { status: "asc" },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { restaurantId, status: "COMPLETED", createdAt: { gte: month } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { restaurantId, status: "COMPLETED", createdAt: { gte: year } },
      _sum: { total: true },
    }),
    prisma.product.groupBy({
      by: ["availability"],
      where: { restaurantId },
      orderBy: { availability: "asc" },
      _count: { _all: true },
    }),
    prisma.category.count({ where: { restaurantId } }),
    prisma.analyticsEvent.groupBy({
      by: ["type"],
      where: { restaurantId },
      orderBy: { type: "asc" },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        total: true,
        status: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    // تجميع حسب productId و productName معاً
    prisma.orderItem.groupBy({
      by: ["productId", "productName"],
      where: { order: { restaurantId, status: { not: "CANCELLED" } } },
      _sum: { quantity: true },
      _count: { _all: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.order.findMany({
      where: { restaurantId },
      distinct: ["customerPhone"],
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        customerName: true,
        customerPhone: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.workingHour.count({
      where: {
        branch: { restaurantId },
        isClosed: false,
        opensAt: { not: null },
        closesAt: { not: null },
      },
    }),
  ]);

  // جلب الأسماء العربية للمنتجات من جدول Product لربطها بـ topProducts
  const productIds = rawTopProducts
    .map((item) => item.productId)
    .filter((id): id is string => Boolean(id));

  const dbProducts = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, nameAr: true },
      })
    : [];

  const productMap = new Map(dbProducts.map((p) => [p.id, p.nameAr]));

  // دمج nameAr داخل كائنات topProducts
  const topProducts = rawTopProducts.map((item) => ({
    ...item,
    productNameAr: item.productId ? productMap.get(item.productId) ?? null : null,
  }));

  const status = Object.fromEntries(
    todayByStatus.map((row) => [row.status, row._count?._all ?? 0])
  );
  const productCounts = Object.fromEntries(
    products.map((row) => [row.availability, row._count?._all ?? 0])
  );
  const eventCounts = Object.fromEntries(
    events.map((row) => [row.type, row._count?._all ?? 0])
  );
  const totalProducts = Object.values(productCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    restaurant,
    todayOrders: todayByStatus.reduce((sum, row) => sum + (row._count?._all ?? 0), 0),
    pendingOrders: status.NEW ?? 0,
    completedOrders: status.COMPLETED ?? 0,
    cancelledOrders: status.CANCELLED ?? 0,
    revenueToday: todayByStatus
      .filter((row) => row.status === "COMPLETED")
      .reduce((sum, row) => sum + Number(row._sum?.total ?? 0), 0),
    revenueMonth: Number(monthRevenue._sum.total ?? 0),
    revenueYear: Number(yearRevenue._sum.total ?? 0),
    totalProducts,
    activeProducts: productCounts.AVAILABLE ?? 0,
    hiddenProducts: productCounts.HIDDEN ?? 0,
    categories,
    workingHours,
    qrScans: eventCounts.QR_SCAN ?? 0,
    menuViews: eventCounts.MENU_VIEW ?? 0,
    recentOrders,
    topProducts,
    recentCustomers,
  };
}