import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import type { OrderStatus, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
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
      <article className="dash-card management-card">
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
          <table>
            <thead>
              <tr>
                <th>{t("order")}</th>
                <th>{t("customer")}</th>
                <th>{t("phone")}</th>
                <th>{t("items")}</th>
                <th>{t("total")}</th>
                <th>{t("status")}</th>
                <th>{t("date")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/order/${order.accessToken}`}>
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td>
                    {order.customerName}
                                      </td>
                  <td>
                    {order.customerPhone}
                  </td>
                  <td>{order._count.items}</td>
                  <td>{money(Number(order.total))}</td>
                  <td>
                    <form action={updateStatus}>
                      <input type="hidden" name="id" value={order.id} />
                      <input
                        type="hidden"
                        name="accessToken"
                        value={order.accessToken}
                      />
                      <select name="status" defaultValue={order.status}>
                        {statuses.map((value) => (
                          <option key={value} value={value}>{flow(`statuses.${value}`)}</option>
                        ))}
                      </select>
                      <button>{common("save")}</button>
                    </form>
                  </td>
                  <td>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                    }).format(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      </article>
    </section>
  );
}
