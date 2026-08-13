import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function DashboardSecurityPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const [{ session }, t, result] = await Promise.all([requireTenant(), getTranslations("security"), searchParams]);
  async function changePassword(form: FormData) {
    "use server";
    const { session } = await requireTenant();
    const currentPassword = String(form.get("currentPassword") || "");
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (password !== confirmPassword) redirect("/dashboard/security?result=mismatch");
    if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) redirect("/dashboard/security?result=invalid");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { passwordHash: true } });
    if (!(await compare(currentPassword, user.passwordHash))) redirect("/dashboard/security?result=incorrect");
    await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash: await hash(password, 12), sessionVersion: { increment: 1 } } });
    redirect("/dashboard/security?result=changed");
  }
  return <section className="dash-main"><header><div><small>{session.user.name}</small><h1>{t("security")}</h1><p>{t("securityHelp")}</p></div></header>{result.result === "changed" && <p className="form-success">{t("changed")}</p>}{result.result === "incorrect" && <p className="form-error">{t("incorrect")}</p>}{result.result === "invalid" && <p className="form-error">{t("invalidPassword")}</p>}{result.result === "mismatch" && <p className="form-error">{t("mismatch")}</p>}<article className="dash-card"><form action={changePassword} className="settings-grid"><label className="full">{t("currentPassword")}<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>{t("newPassword")}<input name="password" type="password" required minLength={8} maxLength={128} pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}" autoComplete="new-password" /><small>{t("passwordHint")}</small></label><label>{t("confirmPassword")}<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label><button className="button primary full">{t("changePassword")}</button></form></article></section>;
}
