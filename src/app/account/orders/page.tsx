import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/customer";

export const dynamic = "force-dynamic";

export default async function CustomerOrders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { session } = await requireCustomer();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const take = 20;
  const where = { customerUserId: session.user.id };
  const [t, flow, locale, orders, total] = await Promise.all([
    getTranslations("customerAccount"),
    getTranslations("launchPolish.orders"),
    getLocale(),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        accessToken: true,
        orderNumber: true,
        total: true,
        status: true,
        createdAt: true,
        restaurant: {
          select: {
            name: true,
            nameAr: true,
            slug: true,
            currency: true,
          },
        },
        items: { select: { productId: true, quantity: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return (
    <section className="customer-main">
      <header>
        <h1>{t("orders.title")}</h1>
        <p>{t("orders.subtitle")}</p>
      </header>
      <article className="customer-table-card">
        {orders.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("orders.restaurant")}</th>
                <th>{t("orders.date")}</th>
                <th>{t("orders.status")}</th>
                <th>{t("orders.total")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const reorder = order.items
                  .filter((item) => item.productId)
                  .map((item) => `${item.productId}:${item.quantity}`)
                  .join(",");
                return (
                  <tr key={order.id}>
                    <td data-label={t("orders.restaurant")}>
                      <b>
                        {locale === "ar" && order.restaurant.nameAr
                          ? order.restaurant.nameAr
                          : order.restaurant.name}
                      </b>
                      <small>{order.orderNumber}</small>
                    </td>
                    <td data-label={t("orders.date")}>{new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                      }).format(order.createdAt)}
                    </td>
                    <td data-label={t("orders.status")}><span className="customer-status">
                        {flow(`statuses.${order.status}`)}
                      </span>
                    </td>
                    <td data-label={t("orders.total")}>{new Intl.NumberFormat(locale, {
                        style: "currency",
                        currency: order.restaurant.currency,
                      }).format(Number(order.total))}
                    </td>
                    <td data-label={t("orders.details")}><div className="table-actions">
                        <Link href={`/order/${order.accessToken}`}>
                          {t("orders.details")}
                        </Link>
                        {reorder && (
                          <Link
                            href={`/menu/${order.restaurant.slug}?reorder=${encodeURIComponent(reorder)}`}
                          >
                            {t("orders.reorder")}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p>{t("orders.empty")}</p>
        )}
        <div className="pagination">
          {page > 1 && (
            <Link href={`?page=${page - 1}`}>{t("common.previous")}</Link>
          )}
          <span>
            {page} / {Math.max(1, Math.ceil(total / take))}
          </span>
          {page * take < total && (
            <Link href={`?page=${page + 1}`}>{t("common.next")}</Link>
          )}
        </div>
      </article>
    </section>
  );
}
