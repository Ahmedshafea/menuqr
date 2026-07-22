import Link from "next/link";
import { BarChart3, Eye, Package, QrCode, ShoppingBag, Tags } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { session, restaurantId } = await requireTenant();
  const [data, t, common, locale] = await Promise.all([getDashboardData(restaurantId), getTranslations("dashboard"), getTranslations("common"), getLocale()]);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: data.restaurant.currency }).format(value);
  const stats = [
    { label: t("todayOrders"), value: data.todayOrders, icon: ShoppingBag }, { label: t("revenueToday"), value: money(data.revenueToday), icon: BarChart3 },
    { label: t("totalProducts"), value: data.totalProducts, icon: Package }, { label: t("categories"), value: data.categories, icon: Tags },
    { label: t("pendingOrders"), value: data.pendingOrders, icon: ShoppingBag }, { label: t("completedOrders"), value: data.completedOrders, icon: ShoppingBag },
    { label: t("qrScans"), value: data.qrScans, icon: QrCode }, { label: t("menuViews"), value: data.menuViews, icon: Eye },
  ];
  return <section className="dash-main"><header><div><small>{data.restaurant.name}</small><h1>{t("greeting", { name: session.user.name?.split(" ")[0] || data.restaurant.name })}</h1><p>{t("summary")}</p></div><Link className="button primary" href={`/menu/${data.restaurant.slug}`}><Eye />{common("viewMenu")}</Link></header><div className="stats">{stats.map(stat => <article key={stat.label}><stat.icon /><p>{stat.label}</p><strong>{stat.value}</strong></article>)}</div><div className="dash-grid"><article className="dash-card recent"><h2>{t("recentOrders")}</h2>{data.recentOrders.length ? <table><tbody>{data.recentOrders.map(order => <tr key={order.id}><td>{order.orderNumber}</td><td>{order.customerName}</td><td>{order._count.items}</td><td>{money(Number(order.total))}</td></tr>)}</tbody></table> : <p>{common("noData")}</p>}</article><article className="dash-card"><h2>{t("topProducts")}</h2><div className="rank-list">{data.topProducts.length ? data.topProducts.map((product, index) => <div key={product.productName}><b>{index + 1}</b><span>{product.productName}</span><strong>{product._sum?.quantity ?? 0}</strong></div>) : <p>{common("noData")}</p>}</div></article><article className="dash-card"><h2>{t("recentCustomers")}</h2><div className="rank-list">{data.recentCustomers.length ? data.recentCustomers.map(customer => <div key={customer.customerPhone}><span>{customer.customerName}<small>{customer.customerPhone}</small></span></div>) : <p>{common("noData")}</p>}</div></article></div></section>;
}
