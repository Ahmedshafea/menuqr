import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { DashboardDisclosure, RecordDisclosure } from "@/components/dashboard-disclosure";

export const dynamic = "force-dynamic";

export default async function RestaurantCustomers({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const { restaurantId } = await requireTenant();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const take = 25;
  const q = (params.q || "").trim().slice(0, 60);
  const where = { restaurantId, ...(q ? { OR: [{ customerName: { contains: q, mode: "insensitive" as const } }, { customerPhone: { contains: q } }] } : {}) };
  const [t, common, locale, restaurant, groups, totalResult] = await Promise.all([
    getTranslations("customerAccount.crm"), getTranslations("common"), getLocale(),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { currency: true } }),
    prisma.order.groupBy({ by: ["customerPhone"], where, orderBy: { _max: { createdAt: "desc" } }, skip: (page - 1) * take, take, _count: { _all: true }, _sum: { total: true }, _avg: { total: true }, _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(DISTINCT "customerPhone")::bigint AS count FROM "Order" WHERE "restaurantId" = ${restaurantId} ${q ? Prisma.sql`AND ("customerName" ILIKE ${`%${q}%`} OR "customerPhone" LIKE ${`%${q}%`})` : Prisma.empty}`),
  ]);
  const totalGroups = Number(totalResult[0]?.count ?? 0);
  const phones = groups.map((group) => group.customerPhone);
  const histories = phones.length ? await prisma.order.findMany({ where: { restaurantId, customerPhone: { in: phones } }, orderBy: { createdAt: "desc" }, take: 1000, select: { customerName: true, customerPhone: true, deliveryAddress: true, items: { select: { productName: true, quantity: true } } } }) : [];
  const details = new Map<string, { name: string; address: string | null; products: Map<string, number> }>();
  for (const order of histories) {
    const current = details.get(order.customerPhone) ?? { name: order.customerName, address: order.deliveryAddress, products: new Map<string, number>() };
    if (!current.address && order.deliveryAddress) current.address = order.deliveryAddress;
    for (const item of order.items) current.products.set(item.productName, (current.products.get(item.productName) || 0) + item.quantity);
    details.set(order.customerPhone, current);
  }
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: restaurant.currency }).format(value);
  return (
    <section className="dash-main">
      <header><div><small>{t("nav")}</small><h1>{t("title")}</h1><p>{t("subtitle")}</p></div></header>
      <DashboardDisclosure title={t("title")} summary={totalGroups} className="management-card">
        <form className="management-toolbar"><div className="dashboard-search"><input name="q" defaultValue={q} placeholder={t("search")} /></div></form>
        <div className="record-list">
          {groups.length ? groups.map((group) => {
            const detail = details.get(group.customerPhone);
            const products = detail ? [...detail.products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name).join(", ") : "—";
            return (
              <RecordDisclosure key={group.customerPhone} title={detail?.name || t("guest")} meta={`${group._count._all} · ${money(Number(group._sum.total || 0))}`}>
                <p><b>{t("phone")}</b><span>{group.customerPhone}</span></p>
                <p><b>{t("firstOrder")}</b><span>{group._min.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(group._min.createdAt) : "—"}</span></p>
                <p><b>{t("lastOrder")}</b><span>{group._max.createdAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(group._max.createdAt) : "—"}</span></p>
                <p><b>{t("average")}</b><span>{money(Number(group._avg.total || 0))}</span></p>
                <p><b>{t("favoriteProducts")}</b><span>{products}</span></p>
                <p><b>{t("lastAddress")}</b><span>{detail?.address || "—"}</span></p>
              </RecordDisclosure>
            );
          }) : <p>{t("empty")}</p>}
        </div>
        <div className="pagination">{page > 1 && <Link href={`?page=${page - 1}&q=${encodeURIComponent(q)}`}>{common("previous")}</Link>}<span>{page} / {Math.max(1, Math.ceil(totalGroups / take))}</span>{page * take < totalGroups && <Link href={`?page=${page + 1}&q=${encodeURIComponent(q)}`}>{common("next")}</Link>}</div>
      </DashboardDisclosure>
    </section>
  );
}
