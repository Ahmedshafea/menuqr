import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/customer";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; password?: string }>;
}) {
  const { session } = await requireCustomer();
  const [t, user, result] = await Promise.all([
    getTranslations("customerAccount.profile"),
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, email: true, phone: true, language: true },
    }),
    searchParams,
  ]);

  async function save(form: FormData) {
    "use server";
    const { session } = await requireCustomer();
    const name = String(form.get("name") || "").trim().slice(0, 80);
    const phone = String(form.get("phone") || "").replace(/\D/g, "").slice(0, 20);
    const language = String(form.get("language")) === "en" ? "en" : "ar";
    if (name.length < 2) return;
    await prisma.user.update({ where: { id: session.user.id }, data: { name, phone: phone || null, language } });
    redirect("/account/profile?saved=1");
  }

  async function changePassword(form: FormData) {
    "use server";
    const { session } = await requireCustomer();
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) redirect("/account/profile?password=invalid");
    const identity = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { passwordHash: true } });
    if (!(await compare(currentPassword, identity.passwordHash))) redirect("/account/profile?password=incorrect");
    await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash: await hash(newPassword, 12) } });
    redirect("/account/profile?password=changed");
  }

  return <section className="customer-main"><header><h1>{t("title")}</h1></header>{result.saved&&<p className="form-success">{t("saved")}</p>}<form action={save} className="customer-form-card profile-form"><label>{t("name")}<input name="name" defaultValue={user.name} required minLength={2}/></label><label>{t("phone")}<input name="phone" defaultValue={user.phone||""} inputMode="tel"/></label><label>{t("email")}<input value={user.email} disabled/></label><label>{t("language")}<select name="language" defaultValue={user.language}><option value="ar">{t("arabic")}</option><option value="en">{t("english")}</option></select></label><button className="button primary">{t("save")}</button></form><h2>{t("password")}</h2>{result.password==="changed"&&<p className="form-success">{t("passwordChanged")}</p>}{result.password==="incorrect"&&<p className="form-error">{t("passwordIncorrect")}</p>}{result.password==="invalid"&&<p className="form-error">{t("passwordInvalid")}</p>}<form action={changePassword} className="customer-form-card profile-form"><label>{t("currentPassword")}<input name="currentPassword" type="password" required autoComplete="current-password"/></label><label>{t("newPassword")}<input name="newPassword" type="password" required minLength={8} pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}" autoComplete="new-password"/></label><button className="button primary">{t("changePassword")}</button></form></section>;
}
