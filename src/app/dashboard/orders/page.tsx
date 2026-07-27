import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import type { OrderStatus, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { DashboardDisclosure, RecordDisclosure } from "@/components/dashboard-disclosure";
export const dynamic = "force-dynamic";
const statuses = [
  "NEW",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "ASSIGNED_TO_DRIVER",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
  "FAILED_DELIVERY",
] as const;
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const { restaurantId } = await requireTenant();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const take = 20;
  const status = statuses.includes(params.status as OrderStatus)
    ? (params.status as OrderStatus)
    : undefined;
  const where: Prisma.OrderWhereInput = {
    restaurantId,
    ...(status ? { status } : {}),
    ...(params.q
      ? {
          OR: [
            { orderNumber: { contains: params.q, mode: "insensitive" } },
            { customerName: { contains: params.q, mode: "insensitive" } },
            { customerPhone: { contains: params.q } },
          ],
        }
      : {}),
  };
  const [t, common, flow, empty, locale, restaurant, orders, total] = await Promise.all([
    getTranslations("orders"),
    getTranslations("common"),
    getTranslations("launchPolish.orders"),
    getTranslations("mvpPolish.empty"),
    getLocale(),
    prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { currency: true },
    }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: params.sort === "oldest" ? "asc" : "desc" },
      skip: (page - 1) * take,
      take,
      include: { _count: { select: { items: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  async function updateStatus(form: FormData) {
    "use server";
    const { restaurantId, session } = await requireTenant();
    const id = String(form.get("id"));
    const accessToken = String(form.get("accessToken") ?? "");
    const next = String(form.get("status")) as OrderStatus;
    if (!statuses.includes(next)) return;
    const order = await prisma.order.findFirst({ where: { id, restaurantId }, select: { id: true,driverId:true } });
    if (!order||next==="ASSIGNED_TO_DRIVER"&&!order.driverId) return;
    await prisma.$transaction(async tx=>{await tx.order.update({ where: { id }, data: { status: next,...(next==="OUT_FOR_DELIVERY"?{outForDeliveryAt:new Date()} :{}),...(next==="DELIVERED"||next==="COMPLETED"?{deliveredAt:new Date()}: {}) } });await tx.orderStatusHistory.create({ data: { orderId: id, status: next, userId: session.user.id } });await tx.orderActionLog.create({ data: { orderId: id, userId: session.user.id, action: "STATUS_UPDATED", details: { status: next } } });if(order.driverId&&(next==="DELIVERED"||next==="COMPLETED"||next==="FAILED_DELIVERY"))await tx.deliveryDriver.update({where:{id:order.driverId},data:{status:"AVAILABLE"}});if(next==="DELIVERED")await tx.restaurantNotification.create({data:{restaurantId,type:"DELIVERY_COMPLETED",title:"Delivery completed",href:`/order/${accessToken}`}})});
    revalidatePath("/dashboard/orders");
    if (accessToken) revalidatePath(`/order/${accessToken}`);
    redirect("/dashboard/orders?toast=orderStatusChanged");
  }
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: restaurant.currency,
    }).format(value);
  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("order")}</small>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      <DashboardDisclosure title={t("title")} summary={total} className="management-card">
        <form className="management-toolbar">
          <div className="dashboard-search">
            <input name="q" defaultValue={params.q} placeholder={t("search")} />
          </div>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">{t("allStatuses")}</option>
            {statuses.map((value) => (
              <option key={value} value={value}>{flow(`statuses.${value}`)}</option>
            ))}
          </select>
          <button className="button ghost">{common("search")}</button>
        </form>
        {orders.length ? (
          <>
          <div className="mobile-record-list">
            {orders.map((order) => (
              <RecordDisclosure key={order.id} title={`#${order.orderNumber}`} meta={money(Number(order.total))}>
                <p><b>{t("customer")}</b><span>{order.customerName}</span></p>
                <p><b>{t("phone")}</b><span>{order.customerPhone}</span></p>
                <p><b>{t("items")}</b><span>{order._count.items}</span></p>
                <p><b>{t("status")}</b><span>{flow(`statuses.${order.status}`)}</span></p>
                <Link className="button primary" href={`/order/${order.accessToken}`}>{t("order")}</Link>
              </RecordDisclosure>
            ))}
          </div>
          <table className="w-full">
            <thead className="hidden md:table-header-group">
              <tr>
                <th>{t("order")}</th>
                <th>{t("customer")}</th>
                <th className="hidden lg:table-cell">{t("phone")}</th>
                <th className="hidden xl:table-cell">{t("items")}</th>
                <th>{t("total")}</th>
                <th>{t("status")}</th>
                <th className="hidden lg:table-cell">{t("date")}</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {orders.map((order) => (
                <tr key={order.id} className="block md:table-row border md:border-0 rounded-xl mb-4 p-4 md:p-0 bg-white md:bg-transparent">
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("order")}>
                    <Link href={`/order/${order.accessToken}`} className="text-orange-600 font-bold">
                      #{order.orderNumber}
                    </Link>
                  </td>
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("customer")}>
                    {order.customerName}
                  </td>
                  <td className="block md:table-cell py-2 md:py-4 lg:table-cell" data-label={t("phone")}>
                    {order.customerPhone}
                  </td>
                  <td className="block md:table-cell py-2 md:py-4 xl:table-cell" data-label={t("items")}>{order._count.items}</td>
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("total")}>{money(Number(order.total))}</td>
                  <td className="block md:table-cell py-2 md:py-4" data-label={t("status")}>
                    <form action={updateStatus} className="flex gap-2">
                      <input type="hidden" name="id" value={order.id} />
                      <input
                        type="hidden"
                        name="accessToken"
                        value={order.accessToken}
                      />
                      <select name="status" defaultValue={order.status} className="flex-1 min-w-0">
                        {statuses.map((value) => (
                          <option key={value} value={value}>{flow(`statuses.${value}`)}</option>
                        ))}
                      </select>
                      <button className="px-2 bg-slate-800 text-white rounded">✓</button>
                    </form>
                  </td>
                  <td className="block md:table-cell py-2 md:py-4 lg:table-cell" data-label={t("date")}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                    }).format(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></>

        ) : (
          <div className="friendly-empty"><h2>{empty("ordersTitle")}</h2><p>{empty("ordersHelp")}</p></div>
        )}
        <div className="pagination">
          {page > 1 && <a href={`?page=${page - 1}`}>{common("previous")}</a>}
          <span>
            {page} / {Math.max(1, Math.ceil(total / take))}
          </span>
          {page * take < total && (
            <a href={`?page=${page + 1}`}>{common("next")}</a>
          )}
        </div>
      </DashboardDisclosure>
    </section>
  );
}
