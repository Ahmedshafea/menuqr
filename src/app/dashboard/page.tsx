import Link from "next/link";
import { BarChart3, CheckCircle2, Circle, Crown, Eye, Package, QrCode, ShoppingBag, Tags } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getDashboardData } from "@/lib/dashboard-data";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { DashboardDisclosure, RecordDisclosure } from "@/components/dashboard-disclosure";
import { ensureRestaurantSubscription } from "@/lib/subscription-plans";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { session, restaurantId } = await requireTenant();
  const [data, subscription, t, common, setup, empty, branchText, planText, locale] = await Promise.all([getDashboardData(restaurantId), ensureRestaurantSubscription(restaurantId), getTranslations("dashboard"), getTranslations("common"), getTranslations("mvpPolish.setup"), getTranslations("mvpPolish.empty"), getTranslations("branches"), getTranslations("subscriptionPlans"), getLocale()]);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: data.restaurant.currency }).format(value);
  const stats = [
    ...(subscription ? [
      { label: planText("subscription"), value: locale === "ar" && subscription.plan.nameAr ? subscription.plan.nameAr : subscription.plan.name, icon: Crown },
      { label: planText("status"), value: planText(`statuses.${subscription.status}`), icon: CheckCircle2 },
      { label: planText("expires"), value: subscription.endsAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(subscription.endsAt) : planText("noExpiry"), icon: Crown },
      { label: subscription.launchPromotion ? planText("launchActive") : planText("upgrade"), value: <Link href="/dashboard/subscription">{planText("upgrade")}</Link>, icon: Crown },
    ] : []),
    { label: t("todayOrders"), value: data.todayOrders, icon: ShoppingBag }, { label: t("revenueToday"), value: money(data.revenueToday), icon: BarChart3 },
    { label: t("totalProducts"), value: data.totalProducts, icon: Package }, { label: t("categories"), value: data.categories, icon: Tags },
    { label: t("pendingOrders"), value: data.pendingOrders, icon: ShoppingBag }, { label: t("completedOrders"), value: data.completedOrders, icon: ShoppingBag },
    { label: t("qrScans"), value: data.qrScans, icon: QrCode }, { label: t("menuViews"), value: data.menuViews, icon: Eye },
  ];
  const checklist = [
    { key: "restaurant", done: Boolean(data.restaurant.description || data.restaurant.descriptionAr || data.restaurant.address), href: "/dashboard/settings" },
    { key: "logo", done: Boolean(data.restaurant.logoUrl), href: "/dashboard/settings" },
    { key: "category", done: data.categories > 0, href: "/dashboard/menu" },
    { key: "product", done: data.totalProducts > 0, href: "/dashboard/menu" },
    { key: "whatsapp", done: Boolean(data.restaurant.whatsapp), href: "/dashboard/settings" },
    { key: "hours", done: data.workingHours > 0, href: "/dashboard/branches" },
    { key: "qr", done: true, href: "/dashboard/settings#restaurant-qr" },
  ];
  const completed = checklist.filter((item) => item.done).length;
  async function dismissChecklist() {
    "use server";
    const { restaurantId } = await requireTenant();
    await prisma.setting.updateMany({ where: { restaurantId }, data: { setupChecklistDismissed: true } });
    revalidatePath("/dashboard");
  }
  return <section className="dash-main"><header><div><small>{data.restaurant.name}</small><h1>{t("greeting", { name: session.user.name?.split(" ")[0] || data.restaurant.name })}</h1><p>{t("summary")}</p></div><Link className="button primary" href={`/menu/${data.restaurant.slug}`}><Eye />{common("viewMenu")}</Link></header>{!data.restaurant.settings?.setupChecklistDismissed&&<DashboardDisclosure title={setup("title")} summary={setup("progress",{done:completed,total:checklist.length})}><article className="setup-checklist"><header>{completed===checklist.length&&<form action={dismissChecklist}><button>{setup("dismiss")}</button></form>}</header><div className="setup-progress"><i style={{width:`${completed/checklist.length*100}%`}}/></div><div>{checklist.map(item=><Link href={item.href} key={item.key}>{item.done?<CheckCircle2/>:<Circle/>}{setup(item.key as never)}</Link>)}</div></article></DashboardDisclosure>}<DashboardDisclosure title={t("summary")} summary={`${stats.length}`}><div className="stats">{stats.map(stat => <article key={stat.label}><stat.icon /><p>{stat.label}</p><strong>{stat.value}</strong></article>)}</div></DashboardDisclosure><div className="dash-grid"><DashboardDisclosure title={t("recentOrders")} summary={data.recentOrders.length}>{data.recentOrders.length ? <div className="record-list">{data.recentOrders.map(order => <RecordDisclosure key={order.id} title={`#${order.orderNumber}`} meta={money(Number(order.total))}><p><b>{t("customer")}</b><span>{order.customerName}</span></p><p><b>{branchText("selectedBranch")}</b><span>{order.branch?.name ?? "—"}</span></p><p><b>{t("products")}</b><span>{order._count.items}</span></p><p><b>{t("revenue")}</b><span>{money(Number(order.total))}</span></p></RecordDisclosure>)}</div> : <div className="friendly-empty compact"><ShoppingBag/><h3>{empty("ordersTitle")}</h3><p>{empty("ordersHelp")}</p></div>}</DashboardDisclosure>
  
<DashboardDisclosure title={t("topProducts")} summary={data.topProducts.length}>
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
</DashboardDisclosure>
  
  <DashboardDisclosure title={t("recentCustomers")} summary={data.recentCustomers.length}><div className="record-list">{data.recentCustomers.length ? data.recentCustomers.map(customer => <RecordDisclosure key={customer.customerPhone} title={customer.customerName} meta={customer.customerPhone}><p><b>{t("customer")}</b><span>{customer.customerName}</span></p><p><b>{t("products")}</b><span>{customer.customerPhone}</span></p></RecordDisclosure>) : <p>{common("noData")}</p>}</div></DashboardDisclosure></div></section>;
}
