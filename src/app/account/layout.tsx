import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart, Home, LogOut, MapPin, QrCode, ShoppingBag, Store, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import "./account.css";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([auth(), getTranslations("customerAccount.nav")]);
  if (!session) redirect("/login");
  if (!session.user.roles.includes("CUSTOMER")) redirect("/auth/continue");
  const links = [
    { href: "/account", label: t("home"), icon: Home },
    { href: "/account/orders", label: t("orders"), icon: ShoppingBag },
    { href: "/account/favorites/restaurants", label: t("restaurants"), icon: Store },
    { href: "/account/favorites/products", label: t("products"), icon: Heart },
    { href: "/account/addresses", label: t("addresses"), icon: MapPin },
    { href: "/account/profile", label: t("profile"), icon: UserRound },
  ];
  return <main className="customer-shell"><aside className="customer-side"><Link href="/" className="brand"><span><QrCode /></span>MenuQR</Link><nav>{links.map(({href,label,icon:Icon})=><Link href={href} key={href}><Icon />{label}</Link>)}</nav><div><LanguageSwitcher compact/>{session.user.restaurantId&&<Link href="/dashboard"><Store />{t("restaurantDashboard")}</Link>}<form action={async()=>{"use server";await signOut({redirectTo:"/"});}}><button><LogOut />{t("signOut")}</button></form></div></aside>{children}</main>;
}
