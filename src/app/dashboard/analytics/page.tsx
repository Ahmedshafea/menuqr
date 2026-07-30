import { startOfDay, subDays } from "date-fns";
import { BarChart3, Bike, Eye, ShoppingBag, Store, TrendingUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { DashboardDisclosure, RecordDisclosure } from "@/components/dashboard-disclosure";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { restaurantId } = await requireTenant();
  const since = startOfDay(subDays(new Date(), 29));
  const [t, d, empty, deliveryText, promotionText, locale, restaurant, orders, events, top, drivers, promotionSummary, promotionTop] = await Promise.all([
    getTranslations("analytics"), getTranslations("dashboard"), getTranslations("mvpPolish.empty"), getTranslations("restaurantWorkflow.delivery"), getTranslations("promotions.analytics"), getLocale(),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { currency: true } }),
    prisma.order.findMany({ where: { restaurantId, createdAt: { gte: since } }, select: { total: true, status: true, createdAt: true, fulfillmentType: true, outForDeliveryAt: true, deliveredAt: true, driver: { select: { id: true, name: true } } } }),
    prisma.analyticsEvent.groupBy({ by: ["type"], where: { restaurantId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.orderItem.groupBy({ by: ["productName"], where: { order: { restaurantId, createdAt: { gte: since }, status: { not: "CANCELLED" } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 10 }),
    prisma.order.groupBy({ by: ["driverId"], where: { restaurantId, driverId: { not: null }, createdAt: { gte: since }, status: { in: ["DELIVERED", "COMPLETED"] } }, _count: { _all: true }, orderBy: { _count: { driverId: "desc" } }, take: 5 }),
    prisma.promotionOrder.aggregate({ where: { order: { restaurantId }, createdAt: { gte: since } }, _sum: { discountAmount: true }, _count: { _all: true } }),
    prisma.promotionOrder.groupBy({ by: ["promotionId", "promotionName"], where: { order: { restaurantId }, createdAt: { gte: since } }, _sum: { discountAmount: true }, _count: { _all: true }, orderBy: { _count: { promotionId: "desc" } }, take: 5 }),
  ]);
  const completed = orders.filter((order) => order.status === "COMPLETED");
  const revenue = completed.reduce((sum, order) => sum + Number(order.total), 0);
  const views = events.find((event) => event.type === "MENU_VIEW")?._count._all ?? 0;
  const scans = events.find((event) => event.type === "QR_SCAN")?._count._all ?? 0;
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: restaurant.currency }).format(value);
  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = startOfDay(subDays(new Date(), 29 - index));
    return { date, count: orders.filter((order) => startOfDay(order.createdAt).getTime() === date.getTime()).length };
  });
  const max = Math.max(1, ...daily.map((item) => item.count));
  const delivered = orders.filter((order) => order.outForDeliveryAt && order.deliveredAt);
  const averageDelivery = delivered.length ? Math.round(delivered.reduce((sum, order) => sum + (order.deliveredAt!.getTime() - order.outForDeliveryAt!.getTime()) / 60000, 0) / delivered.length) : 0;
  const driverNames = new Map(orders.flatMap((order) => order.driver ? [[order.driver.id, order.driver.name]] : []));
  if (!orders.length && !events.length) return <section className="dash-main"><header><div><h1>{t("title")}</h1></div></header><article className="dash-card friendly-empty"><BarChart3 /><h2>{empty("analyticsTitle")}</h2><p>{empty("analyticsHelp")}</p></article></section>;
  const stats = [
    { label: d("menuViews"), value: views, icon: Eye },
    { label: d("todayOrders"), value: orders.length, icon: ShoppingBag },
    { label: t("revenue"), value: money(revenue), icon: TrendingUp },
    { label: t("averageOrder"), value: money(completed.length ? revenue / completed.length : 0), icon: BarChart3 },
    { label: deliveryText("delivery"), value: orders.filter((order) => order.fulfillmentType === "DELIVERY").length, icon: Bike },
    { label: deliveryText("pickup"), value: orders.filter((order) => order.fulfillmentType === "PICKUP").length, icon: Store },
    { label: deliveryText("dineIn"), value: orders.filter((order) => order.fulfillmentType === "DINE_IN").length, icon: Store },
    { label: deliveryText("eta"), value: `${averageDelivery} min`, icon: Bike },
  ];
  return (
    <section className="dash-main">
      <header><div><small>{t("last30")}</small><h1>{t("title")}</h1><p>{t("subtitle")}</p></div></header>
      <DashboardDisclosure title={t("title")} summary={t("last30")}><div className="stats">{stats.map((stat) => <article key={stat.label}><stat.icon /><p>{stat.label}</p><strong>{stat.value}</strong></article>)}</div></DashboardDisclosure>
      <DashboardDisclosure title={t("dailyOrders")}><div className="analytics-bars">{daily.map((day) => <i key={day.date.toISOString()} style={{ height: `${Math.max(3, day.count / max * 100)}%` }} title={`${day.count}`} />)}</div></DashboardDisclosure>
      <DashboardDisclosure title={t("popular")} summary={top.length}><div className="record-list">{top.map((product, index) => <RecordDisclosure key={product.productName} title={`${index + 1}. ${product.productName}`} meta={product._sum.quantity ?? 0}><p><b>{t("popular")}</b><span>{product.productName}</span></p><p><b>{d("qrScans")}</b><span>{scans}</span></p></RecordDisclosure>)}</div></DashboardDisclosure>
      <DashboardDisclosure title={promotionText("title")} summary={promotionSummary._count._all}><div className="stats"><article><p>{promotionText("ordersAffected")}</p><strong>{promotionSummary._count._all}</strong></article><article><p>{promotionText("discountCost")}</p><strong>{money(Number(promotionSummary._sum.discountAmount || 0))}</strong></article><article><p>{promotionText("conversion")}</p><strong>{orders.length ? `${Math.round((promotionSummary._count._all / orders.length) * 100)}%` : "0%"}</strong></article></div><div className="record-list">{promotionTop.map((promotion, index) => <RecordDisclosure key={`${promotion.promotionId}-${promotion.promotionName}`} title={`${index + 1}. ${promotion.promotionName}`} meta={promotion._count._all}><p><b>{promotionText("discountCost")}</b><span>{money(Number(promotion._sum.discountAmount || 0))}</span></p></RecordDisclosure>)}</div></DashboardDisclosure>
      <DashboardDisclosure title={deliveryText("title")} summary={drivers.length}><div className="record-list">{drivers.map((driver, index) => <RecordDisclosure key={driver.driverId} title={`${index + 1}. ${driver.driverId ? driverNames.get(driver.driverId) ?? driver.driverId : "—"}`} meta={driver._count._all}><p><b>{deliveryText("title")}</b><span>{driver._count._all}</span></p></RecordDisclosure>)}</div></DashboardDisclosure>
    </section>
  );
}
