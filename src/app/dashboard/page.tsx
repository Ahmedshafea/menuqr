import Link from "next/link";
import { BarChart3, CheckCircle2, Circle, Eye, Package, QrCode, ShoppingBag, Tags } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { session, restaurantId } = await requireTenant();
  const [data, t, common, setup, empty, locale] = await Promise.all([getDashboardData(restaurantId), getTranslations("dashboard"), getTranslations("common"), getTranslations("mvpPolish.setup"), getTranslations("mvpPolish.empty"), getLocale()]);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: data.restaurant.currency }).format(value);
  const stats = [
    { label: t("todayOrders"), value: data.todayOrders, icon: ShoppingBag }, { label: t("revenueToday"), value: money(data.revenueToday), icon: BarChart3 },
    { label: t("totalProducts"), value: data.totalProducts, icon: Package }, { label: t("categories"), value: data.categories, icon: Tags },
    { label: t("pendingOrders"), value: data.pendingOrders, icon: ShoppingBag }, { label: t("completedOrders"), value: data.completedOrders, icon: ShoppingBag },
    { label: t("qrScans"), value: data.qrScans, icon: QrCode }, { label: t("menuViews"), value: data.menuViews, icon: Eye },
  ];
  const checklist = [
    { key: "restaurant", done: Boolean(data.restaurant.description || data.restaurant.descriptionAr || data.restaurant.address), href: "/dashboard/profile" },
    { key: "logo", done: Boolean(data.restaurant.logoUrl), href: "/dashboard/profile" },
    { key: "category", done: data.categories > 0, href: "/dashboard/menu" },
    { key: "product", done: data.totalProducts > 0, href: "/dashboard/menu" },
    { key: "whatsapp", done: Boolean(data.restaurant.whatsapp), href: "/dashboard/settings" },
    { key: "hours", done: data.workingHours > 0, href: "/dashboard/settings" },
    { key: "qr", done: true, href: "/dashboard/settings#restaurant-qr" },
  ];
  const completed = checklist.filter((item) => item.done).length;
  async function dismissChecklist() {
    "use server";
    const { restaurantId } = await requireTenant();
    await prisma.setting.updateMany({ where: { restaurantId }, data: { setupChecklistDismissed: true } });
    revalidatePath("/dashboard");
  }
  return <section className="dash-main"><header><div><small>{data.restaurant.name}</small><h1>{t("greeting", { name: session.user.name?.split(" ")[0] || data.restaurant.name })}</h1><p>{t("summary")}</p></div><Link className="button primary" href={`/menu/${data.restaurant.slug}`}><Eye />{common("viewMenu")}</Link></header>{!data.restaurant.settings?.setupChecklistDismissed&&<article className="setup-checklist"><header><div><h2>{setup("title")}</h2><p>{setup("progress",{done:completed,total:checklist.length})}</p></div>{completed===checklist.length&&<form action={dismissChecklist}><button>{setup("dismiss")}</button></form>}</header><div className="setup-progress"><i style={{width:`${completed/checklist.length*100}%`}}/></div><div>{checklist.map(item=><Link href={item.href} key={item.key}>{item.done?<CheckCircle2/>:<Circle/>}{setup(item.key as never)}</Link>)}</div></article>}<div className="stats">{stats.map(stat => <article key={stat.label}><stat.icon /><p>{stat.label}</p><strong>{stat.value}</strong></article>)}</div><div className="dash-grid"><article className="dash-card recent"><h2>{t("recentOrders")}</h2>{data.recentOrders.length ? <table><tbody>{data.recentOrders.map(order => <tr key={order.id}><td>{order.orderNumber}</td><td>{order.customerName}</td><td>{order._count.items}</td><td>{money(Number(order.total))}</td></tr>)}</tbody></table> : <div className="friendly-empty compact"><ShoppingBag/><h3>{empty("ordersTitle")}</h3><p>{empty("ordersHelp")}</p></div>}</article>
  
<article className="dash-card">
  <h2>{t("topProducts")}</h2>
  <div className="rank-list">
    {data.topProducts.length ? (
      data.topProducts.map((product, index) => {
        // إذا كانت اللغة عربية وله اسم عربي استخدمه، وإلا استخدم الاسم الأساسي
        const displayName = locale === "ar"
          ? (product.productNameAr || product.productName)
          : product.productName;

        return (
          <div key={product.productName + index}>
            <b>{index + 1}</b>
            <span>{displayName}</span>
            <strong>{product._sum?.quantity ?? 0}</strong>
          </div>
        );
      })
    ) : (
      <p>{common("noData")}</p>
    )}
  </div>
</article>
  
  <article className="dash-card"><h2>{t("recentCustomers")}</h2><div className="rank-list">{data.recentCustomers.length ? data.recentCustomers.map(customer => <div key={customer.customerPhone}><span>{customer.customerName}<small>{customer.customerPhone}</small></span></div>) : <p>{common("noData")}</p>}</div></article></div></section>;
}
