import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, QrCode } from "lucide-react";
import { auth, signOut } from "@/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import "./dashboard.css";
import "./product-form.css";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from "next-intl/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth(); const t=await getTranslations("dashboard");
  if (!session) redirect("/login");
  return <main className="dash"><aside className="dash-side"><Link href="/" className="brand"><span><QrCode /></span>MenuQR</Link><LanguageSwitcher compact/><DashboardSidebar /><form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button><LogOut />{t("signOut")}</button></form></aside>{children}</main>;
}
