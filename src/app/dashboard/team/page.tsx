import { hash } from "bcryptjs";
import { Plus } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { CloseDetailsButton } from "@/components/close-details-button";
import { featureLimit } from "@/lib/subscription-plans";
export const dynamic = "force-dynamic";
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; page?: string }>;
}) {
  const { restaurantId } = await requireTenant();
  const { result, page: pageParam } = await searchParams; const page = Math.max(1, Number(pageParam) || 1); const take = 25;
  const [t, common, members, total, memberLimit] = await Promise.all([
    getTranslations("team"),
    getTranslations("common"),
    prisma.restaurantMember.findMany({
      where: { restaurantId },
      select: {
        id: true,
        role: true,
        user: { select: { name: true, email: true, emailVerified: true } },
      },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * take, take,
    }),
    prisma.restaurantMember.count({ where: { restaurantId } }),
    featureLimit(restaurantId, "TEAM_MEMBER_LIMIT"),
  ]);
  const canAddMember = memberLimit === null || memberLimit < 0 || total < memberLimit;
  async function addMember(form: FormData) {
    "use server";
    const { restaurantId } = await requireTenant();
    const [limit, currentCount] = await Promise.all([
      featureLimit(restaurantId, "TEAM_MEMBER_LIMIT"),
      prisma.restaurantMember.count({ where: { restaurantId } }),
    ]);
    if (limit !== null && limit >= 0 && currentCount >= limit)
      redirect("/dashboard/subscription?required=TEAM_MEMBER_LIMIT");
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") || "");
    if (name.length < 2 || !email.includes("@") || password.length < 8)
      redirect("/dashboard/team?result=invalid");
    const exists = await prisma.user.findUnique({
      where: { email },
      select: { id: true, restaurantMemberships: { where: { restaurantId }, select: { id: true } } },
    });
    if (exists?.restaurantMemberships.length) redirect("/dashboard/team?result=exists");
    if (exists) {
      await prisma.$transaction([
        prisma.restaurantMember.create({ data: { userId: exists.id, restaurantId, role: "STAFF" } }),
        prisma.userRole.upsert({ where: { userId_role: { userId: exists.id, role: "STAFF" } }, create: { userId: exists.id, role: "STAFF" }, update: {} }),
      ]);
    } else {
      await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 12), emailVerified: new Date(), roles: { create: { role: "STAFF" } }, restaurantMemberships: { create: { restaurantId, role: "STAFF" } } } });
    }
    revalidatePath("/dashboard/team");
    redirect("/dashboard/team?result=created");
  }
  return (
    <section className="dash-main">
      <header>
        <div>
          <small>{t("role")}</small>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        {canAddMember && <details className="product-create">
          <summary className="button primary">
            <Plus />
            {t("invite")}
          </summary>
          <div className="product-form-panel team-form-panel">
            <CloseDetailsButton />
            <h2>{t("invite")}</h2>
            <form action={addMember} className="settings-grid">
              <label>
                {t("name")}
                <input name="name" required minLength={2} />
              </label>
              <label>
                {t("email")}
                <input name="email" type="email" required />
              </label>
              <label className="full">
                {t("password")}
                <input name="password" type="password" minLength={8} required />
              </label>
              <button className="button primary full">{t("addMember")}</button>
            </form>
          </div>
        </details>}
      </header>
      {result === "created" && <p className="form-success">{t("created")}</p>}
      {result === "exists" && <p className="form-error">{t("exists")}</p>}
      {result === "invalid" && <p className="form-error">{t("invalid")}</p>}
      <article className="dash-card management-card">
        {members.length ? (
          <table>
            <thead>
              <tr>
                <th>{t("member")}</th>
                <th>{t("email")}</th>
                <th>{t("role")}</th>
                <th>{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td data-label={t("member")}><strong>{member.user.name}</strong></td>
                  <td data-label={t("email")}>{member.user.email}</td>
                  <td data-label={t("role")}>{member.role}</td>
                  <td data-label={t("status")}><span className="status completed">{common("active")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{t("noMembers")}</p>
        )}
        <div className="pagination">{page > 1 && <Link href={`?page=${page - 1}`}>{common("previous")}</Link>}<span>{page} / {Math.max(1, Math.ceil(total / take))}</span>{page * take < total && <Link href={`?page=${page + 1}`}>{common("next")}</Link>}</div>
      </article>
    </section>
  );
}
