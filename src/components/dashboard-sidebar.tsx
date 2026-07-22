"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, LayoutDashboard, Menu as MenuIcon, Settings, ShoppingBag, Users } from "lucide-react";
import { useTranslations } from "next-intl";

export function DashboardSidebar() {
  const pathname = usePathname(); const t=useTranslations("dashboard");
  const workspace = [{href:"/dashboard",label:t("overview"),icon:LayoutDashboard},{href:"/dashboard/menu",label:t("menu"),icon:MenuIcon},{href:"/dashboard/orders",label:t("orders"),icon:ShoppingBag},{href:"/dashboard/analytics",label:t("analytics"),icon:BarChart3}];
  const manage = [{href:"/dashboard/profile",label:t("profile"),icon:Building2},{href:"/dashboard/team",label:t("team"),icon:Users},{href:"/dashboard/settings",label:t("settings"),icon:Settings}];
  const item = ({ href, label, icon: Icon }: (typeof workspace)[number]) =>
    <Link href={href} className={pathname === href ? "active" : undefined} aria-current={pathname === href ? "page" : undefined}>
      <Icon />{label}
    </Link>;
  return <nav><b>{t("workspace")}</b>{workspace.map(link => <span key={link.href}>{item(link)}</span>)}<b>{t("manage")}</b>{manage.map(link => <span key={link.href}>{item(link)}</span>)}</nav>;
}
