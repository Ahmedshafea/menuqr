import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { BranchDeleteButton } from "@/components/branch-delete-button";
import { RestaurantQr } from "@/components/restaurant-qr";
import { featureLimit } from "@/lib/subscription-plans";

export const dynamic = "force-dynamic";

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { restaurantId } = await requireTenant();
  const [branchLimit, branchCount] = await Promise.all([
    featureLimit(restaurantId, "BRANCH_LIMIT"),
    prisma.branch.count({ where: { restaurantId } }),
  ]);
  const canCreateBranch = branchLimit === null || branchLimit < 0 || branchCount < branchLimit;
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const take = 12;
  const q = params.q?.trim();
  const where = {
    restaurantId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
            { address: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [t, common, qr, locale, restaurant, branches, total] =
    await Promise.all([
      getTranslations("branches"),
      getTranslations("common"),
      getTranslations("qr"),
      getLocale(),
      prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { slug: true },
      }),
      prisma.branch.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * take,
        take,
        select: {
          id: true,
          name: true,
          slug: true,
          phone: true,
          useRestaurantWhatsapp: true,
          whatsappNumber: true,
          isActive: true,
          updatedAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.branch.count({ where }),
    ]);
  const pages = Math.max(1, Math.ceil(total / take));
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/$/, "");

  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("nav")}</small>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        {canCreateBranch && <Link href="/dashboard/branches/new" className="button primary">
          <Plus />
          {t("add")}
        </Link>}
      </header>
      <article className="dash-card management-card">
        <form className="management-toolbar">
          <input name="q" defaultValue={q} placeholder={t("search")} />
          <button className="button ghost">{common("search")}</button>
        </form>
        {branches.length ? (
          <div className="branch-admin-grid">
            {branches.map((branch) => {
              const menuUrl = `${origin}/menu/${restaurant.slug}/${branch.slug}`;
              return (
                <article className="branch-admin-card" key={branch.id}>
                  <header>
                    <div>
                      <h2>{branch.name}</h2>
                      <code>/{branch.slug}</code>
                    </div>
                    <span className={branch.isActive ? "status-ok" : "status-muted"}>
                      {branch.isActive ? t("active") : t("disabled")}
                    </span>
                  </header>
                  <p>
                    <b>{t("phone")}</b>
                    <span>{branch.phone || "—"}</span>
                  </p>
                  <p>
                    <b>{t("whatsappStatus")}</b>
                    <span>
                      {branch.useRestaurantWhatsapp
                        ? t("restaurantNumber")
                        : t("branchNumber")}
                    </span>
                  </p>
                  <p>
                    <b>{t("orders")}</b>
                    <span>{branch._count.orders}</span>
                  </p>
                  <p>
                    <b>{t("updated")}</b>
                    <time>{new Intl.DateTimeFormat(locale).format(branch.updatedAt)}</time>
                  </p>
                  <RestaurantQr
                    menuUrl={menuUrl}
                    slug={`${restaurant.slug}-${branch.slug}`}
                    label={t("qr")}
                    controls={{
                      png: qr("downloadPng"),
                      svg: qr("downloadSvg"),
                      copy: qr("copyLink"),
                      copied: qr("copied"),
                    }}
                  />
                  <footer className="row-actions">
                    <Link
                      href={`/dashboard/branches/${branch.id}`}
                      className="icon-edit"
                      aria-label={t("editAction")}
                    >
                      <Pencil />
                    </Link>
                    <BranchDeleteButton id={branch.id} />
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="friendly-empty">
            <h2>{t("empty")}</h2>
            {canCreateBranch && <Link href="/dashboard/branches/new" className="button primary">
              {t("add")}
            </Link>}
          </div>
        )}
        {pages > 1 && (
          <nav className="pagination">
            {page > 1 && (
              <Link href={`?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
                {common("previous")}
              </Link>
            )}
            <span>
              {page} / {pages}
            </span>
            {page < pages && (
              <Link href={`?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
                {common("next")}
              </Link>
            )}
          </nav>
        )}
      </article>
    </section>
  );
}
