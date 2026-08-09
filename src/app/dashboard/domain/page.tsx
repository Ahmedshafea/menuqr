import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireOwner, requireTenant } from "@/lib/tenant";
import { hasFeature } from "@/lib/subscription-plans";
import { addProjectDomain, isVercelDomainApiConfigured, normalizeCustomDomain, publicVerification, removeProjectDomain, verifyProjectDomain } from "@/lib/custom-domains";
import { RemoveDomainButton } from "@/components/remove-domain-button";

export const dynamic = "force-dynamic";

export default async function CustomDomainPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const [{ restaurantId }, t, query] = await Promise.all([requireTenant(), getTranslations("customDomains"), searchParams]);
  const [available, customDomain] = await Promise.all([
    hasFeature(restaurantId, "CUSTOM_DOMAIN"),
    prisma.customDomain.findUnique({ where: { restaurantId } }),
  ]);

  async function add(form: FormData) {
    "use server";
    const { restaurantId } = await requireOwner();
    if (!(await hasFeature(restaurantId, "CUSTOM_DOMAIN"))) redirect("/dashboard/subscription?required=CUSTOM_DOMAIN");
    let domain: string;
    try { domain = normalizeCustomDomain(String(form.get("domain") || "")); }
    catch { redirect("/dashboard/domain?result=invalid"); }
    const existing = await prisma.customDomain.findUnique({ where: { restaurantId }, select: { domain: true } });
    if (existing && existing.domain !== domain) redirect("/dashboard/domain?result=removeFirst");
    try {
      const response = await addProjectDomain(domain);
      await prisma.customDomain.upsert({
        where: { restaurantId },
        create: { restaurantId, domain, status: response.verified ? "VERIFIED" : "PENDING", verification: publicVerification(response), lastCheckedAt: new Date(), verifiedAt: response.verified ? new Date() : null },
        update: { domain, status: response.verified ? "VERIFIED" : "PENDING", verification: publicVerification(response), lastError: null, lastCheckedAt: new Date(), verifiedAt: response.verified ? new Date() : null },
      });
    } catch (error) {
      console.error(JSON.stringify({ level: "error", context: "custom-domain", event: "add_failed", code: error instanceof Error ? error.message : "UNKNOWN", timestamp: new Date().toISOString() }));
      redirect("/dashboard/domain?result=unavailable");
    }
    revalidatePath("/dashboard/domain");
    revalidateTag("custom-domains");
    redirect("/dashboard/domain?result=added");
  }

  async function verify() {
    "use server";
    const { restaurantId } = await requireOwner();
    if (!(await hasFeature(restaurantId, "CUSTOM_DOMAIN"))) redirect("/dashboard/subscription?required=CUSTOM_DOMAIN");
    const current = await prisma.customDomain.findUnique({ where: { restaurantId } });
    if (!current) redirect("/dashboard/domain");
    let verified = false;
    try {
      const response = await verifyProjectDomain(current.domain);
      verified = Boolean(response.verified);
      await prisma.customDomain.update({ where: { restaurantId }, data: { status: response.verified ? "VERIFIED" : "PENDING", verification: publicVerification(response), lastError: null, lastCheckedAt: new Date(), verifiedAt: response.verified ? new Date() : null } });
      revalidatePath("/dashboard/domain");
      revalidateTag("custom-domains");
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "VERIFICATION_FAILED";
      await prisma.customDomain.update({ where: { restaurantId }, data: { status: "ERROR", lastError: code, lastCheckedAt: new Date() } });
      console.error(JSON.stringify({ level: "error", context: "custom-domain", event: "verify_failed", code, timestamp: new Date().toISOString() }));
      redirect("/dashboard/domain?result=unavailable");
    }
    redirect(`/dashboard/domain?result=${verified ? "verified" : "added"}`);
  }

  async function remove() {
    "use server";
    const { restaurantId } = await requireOwner();
    const current = await prisma.customDomain.findUnique({ where: { restaurantId }, select: { domain: true } });
    if (!current) return;
    try { await removeProjectDomain(current.domain); }
    catch (error) {
      console.error(JSON.stringify({ level: "error", context: "custom-domain", event: "remove_failed", code: error instanceof Error ? error.message : "UNKNOWN", timestamp: new Date().toISOString() }));
      redirect("/dashboard/domain?result=unavailable");
    }
    await prisma.customDomain.delete({ where: { restaurantId } });
    revalidatePath("/dashboard/domain");
    revalidateTag("custom-domains");
    redirect("/dashboard/domain?result=removed");
  }

  if (!available && !customDomain) return <section className="dash-main"><header><div><h1>{t("title")}</h1><p>{t("subtitle")}</p></div></header><article className="dash-card friendly-empty"><h2>{t("upgrade")}</h2><Link className="button primary" href="/dashboard/subscription?plan=BUSINESS">{t("upgradeButton")}</Link></article></section>;

  const verification = Array.isArray(customDomain?.verification) ? customDomain.verification.filter((item): item is { type?: string; domain?: string; value?: string } => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  return <section className="dash-main"><header><div><small>{t("nav")}</small><h1>{t("title")}</h1><p>{t("subtitle")}</p></div></header>{query.result && <p className={query.result === "verified" || query.result === "removed" || query.result === "added" ? "form-success" : "form-error"}>{t(query.result === "verified" ? "verifiedSuccess" : query.result as "added" | "removed" | "invalid" | "unavailable" | "removeFirst")}</p>}<article className="dash-card custom-domain-card">{!isVercelDomainApiConfigured() && <p className="form-error">{t("notConfigured")}</p>}{!customDomain ? <form action={add} className="settings-grid"><label className="full">{t("domain")}<input name="domain" required inputMode="url" placeholder="menu.restaurant.com" aria-describedby="domain-help"/><small id="domain-help">{t("example")}</small></label><button className="button primary full">{t("add")}</button></form> : <><header><div><h2 dir="ltr">{customDomain.domain}</h2><span className={`status ${customDomain.status === "VERIFIED" ? "completed" : customDomain.status === "ERROR" ? "cancelled" : "pending"}`}>{t(customDomain.status === "VERIFIED" ? "verified" : customDomain.status === "ERROR" ? "error" : "pending")}</span></div>{customDomain.status === "VERIFIED" && <a className="button ghost" href={`https://${customDomain.domain}`} target="_blank" rel="noreferrer">{t("open")}</a>}</header>{customDomain.status !== "VERIFIED" && <section><h3>{t("dnsTitle")}</h3><p>{t("dnsHelp")}</p><ul><li>{t("apex")}</li><li>{t("subdomain")}</li></ul>{verification.length > 0 && <><h3>{t("verificationTitle")}</h3><div className="domain-verification-list">{verification.map((item, index) => <code key={`${item.domain}-${index}`}>{item.type || "TXT"} · {item.domain}<br/>{item.value}</code>)}</div></>}<form action={verify}><button className="button primary">{t("verify")}</button></form></section>}<RemoveDomainButton action={remove} label={t("remove")} confirmation={t("confirmRemove")} /></>}</article></section>;
}
