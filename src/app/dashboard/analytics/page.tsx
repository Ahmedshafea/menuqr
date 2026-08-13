import { startOfDay, subDays } from "date-fns";
import { BarChart3, Bike, Eye, ShoppingBag, Store, TrendingUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { DashboardDisclosure, RecordDisclosure } from "@/components/dashboard-disclosure";
import { hasFeature } from "@/lib/subscription-plans";
import { getOrderAnalyticsSummary } from "@/lib/analytics-orders";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { restaurantId } = await requireTenant();
  const [advancedAnalytics, promotionsAvailable] = await Promise.all([
    hasFeature(restaurantId, "ANALYTICS_ADVANCED"),
    hasFeature(restaurantId, "PROMOTIONS"),
  ]);
  const since = startOfDay(subDays(new Date(), 29));
  const [t, d, empty, deliveryText, promotionText, locale, restaurant, orderSummary, events, top, drivers, promotionSummary, promotionTop] = await Promise.all([
    getTranslations("analytics"), getTranslations("dashboard"), getTranslations("mvpPolish.empty"), getTranslations("restaurantWorkflow.delivery"), getTranslations("promotions.analytics"), getLocale(),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { currency: true } }),
    getOrderAnalyticsSummary(restaurantId, since),
    prisma.analyticsEvent.groupBy({ by: ["type"], where: { restaurantId, createdAt: { gte: since } }, _count: { _all: true } }),
    advancedAnalytics ? prisma.orderItem.groupBy({ by: ["productName"], where: { order: { restaurantId, createdAt: { gte: since }, status: { not: "CANCELLED" } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 10 }) : Promise.resolve([]),
    advancedAnalytics ? prisma.order.groupBy({ by: ["driverId"], where: { restaurantId, driverId: { not: null }, createdAt: { gte: since }, status: { in: ["DELIVERED", "COMPLETED"] } }, _count: { _all: true }, orderBy: { _count: { driverId: "desc" } }, take: 5 }) : Promise.resolve([]),
    promotionsAvailable ? prisma.promotionOrder.aggregate({ where: { order: { restaurantId }, createdAt: { gte: since } }, _sum: { discountAmount: true }, _count: { _all: true } }) : Promise.resolve(null),
    promotionsAvailable ? prisma.promotionOrder.groupBy({ by: ["promotionId", "promotionName"], where: { order: { restaurantId }, createdAt: { gte: since } }, _sum: { discountAmount: true }, _count: { _all: true }, orderBy: { _count: { promotionId: "desc" } }, take: 5 }) : Promise.resolve([]),
  ]);
  const { byStatus: ordersByStatus, byFulfillment: ordersByFulfillment, daily: dailyRows } = orderSummary;
  const totalOrders = ordersByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const completed = ordersByStatus.find((row) => row.status === "COMPLETED");
  const completedCount = completed?._count._all ?? 0;
  const revenue = Number(completed?._sum.total ?? 0);
  const views = events.find((event) => event.type === "MENU_VIEW")?._count._all ?? 0;
  const scans = events.find((event) => event.type === "QR_SCAN")?._count._all ?? 0;
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: restaurant.currency }).format(value);
  const dailyCounts = new Map(dailyRows.map((row) => [startOfDay(row.day).getTime(), row.count]));
  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = startOfDay(subDays(new Date(), 29 - index));
    return { date, count: dailyCounts.get(date.getTime()) ?? 0 };
  });
  const max = Math.max(1, ...daily.map((item) => item.count));
  const averageDelivery = Math.round(orderSummary.averageDeliveryMinutes ?? 0);
  const driverIds = drivers.flatMap((driver) => driver.driverId ? [driver.driverId] : []);
  const driverNames = new Map((driverIds.length ? await prisma.deliveryDriver.findMany({ where: { restaurantId, id: { in: driverIds } }, select: { id: true, name: true } }) : []).map((driver) => [driver.id, driver.name]));
  const fulfillmentCounts = new Map(ordersByFulfillment.map((row) => [row.fulfillmentType, row._count._all]));
  if (!totalOrders && !events.length) return <section className="dash-main"><header><div><h1>{t("title")}</h1></div></header><article className="dash-card friendly-empty"><BarChart3 /><h2>{empty("analyticsTitle")}</h2><p>{empty("analyticsHelp")}</p></article></section>;
  const stats = [
    { label: d("menuViews"), value: views, icon: Eye },
    { label: d("todayOrders"), value: totalOrders, icon: ShoppingBag },
    { label: d("qrScans"), value: scans, icon: Eye },
    ...(advancedAnalytics ? [
    { label: t("revenue"), value: money(revenue), icon: TrendingUp },
    { label: t("averageOrder"), value: money(completedCount ? revenue / completedCount : 0), icon: BarChart3 },
    { label: deliveryText("delivery"), value: fulfillmentCounts.get("DELIVERY") ?? 0, icon: Bike },
    { label: deliveryText("pickup"), value: fulfillmentCounts.get("PICKUP") ?? 0, icon: Store },
    { label: deliveryText("dineIn"), value: fulfillmentCounts.get("DINE_IN") ?? 0, icon: Store },
    { label: deliveryText("eta"), value: `${averageDelivery} min`, icon: Bike },
    ] : []),
  ];
  return (
    <section className="dash-main">
      <header><div><small>{t("last30")}</small><h1>{t("title")}</h1><p>{t("subtitle")}</p></div></header>
      <DashboardDisclosure title={t("title")} summary={t("last30")}><div className="stats">{stats.map((stat) => <article key={stat.label}><stat.icon /><p>{stat.label}</p><strong>{stat.value}</strong></article>)}</div></DashboardDisclosure>
      <DashboardDisclosure title={t("dailyOrders")}><div className="analytics-bars">{daily.map((day) => <i key={day.date.toISOString()} style={{ height: `${Math.max(3, day.count / max * 100)}%` }} title={`${day.count}`} />)}</div></DashboardDisclosure>
      {advancedAnalytics && <DashboardDisclosure title={t("popular")} summary={top.length}><div className="record-list">{top.map((product, index) => <RecordDisclosure key={product.productName} title={`${index + 1}. ${product.productName}`} meta={product._sum.quantity ?? 0}><p><b>{t("popular")}</b><span>{product.productName}</span></p><p><b>{d("qrScans")}</b><span>{scans}</span></p></RecordDisclosure>)}</div></DashboardDisclosure>}
      {promotionsAvailable && promotionSummary && <DashboardDisclosure title={promotionText("title")} summary={promotionSummary._count._all}><div className="stats"><article><p>{promotionText("ordersAffected")}</p><strong>{promotionSummary._count._all}</strong></article><article><p>{promotionText("discountCost")}</p><strong>{money(Number(promotionSummary._sum.discountAmount || 0))}</strong></article><article><p>{promotionText("conversion")}</p><strong>{totalOrders ? `${Math.round((promotionSummary._count._all / totalOrders) * 100)}%` : "0%"}</strong></article></div><div className="record-list">{promotionTop.map((promotion, index) => <RecordDisclosure key={`${promotion.promotionId}-${promotion.promotionName}`} title={`${index + 1}. ${promotion.promotionName}`} meta={promotion._count._all}><p><b>{promotionText("discountCost")}</b><span>{money(Number(promotion._sum.discountAmount || 0))}</span></p></RecordDisclosure>)}</div></DashboardDisclosure>}
      {advancedAnalytics && <DashboardDisclosure title={deliveryText("title")} summary={drivers.length}><div className="record-list">{drivers.map((driver, index) => <RecordDisclosure key={driver.driverId} title={`${index + 1}. ${driver.driverId ? driverNames.get(driver.driverId) ?? driver.driverId : "—"}`} meta={driver._count._all}><p><b>{deliveryText("title")}</b><span>{driver._count._all}</span></p></RecordDisclosure>)}</div></DashboardDisclosure>}
    </section>
  );
}
