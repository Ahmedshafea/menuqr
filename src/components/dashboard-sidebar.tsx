"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bike, CreditCard, Globe2, LayoutDashboard, MapPinned, Menu as MenuIcon, Settings, ShieldCheck, ShoppingBag, Star, Tag, Users } from "lucide-react";
import { useTranslations } from "next-intl";

export function DashboardSidebar({ features = [] }: { features?: string[] }) {
  const pathname = usePathname(); const t=useTranslations("dashboard");
  const crm=useTranslations("customerAccount.crm");
  const workflow=useTranslations("restaurantWorkflow.nav");
  const promotions=useTranslations("promotions");
  const branches=useTranslations("branches");
  const plans=useTranslations("subscriptionPlans");
  const security=useTranslations("security");
  const domains=useTranslations("customDomains");
  const workspace = [{href:"/dashboard",label:t("overview"),icon:LayoutDashboard},{href:"/dashboard/menu",label:t("menu"),icon:MenuIcon},...(features.includes("PROMOTIONS")?[{href:"/dashboard/promotions",label:promotions("nav"),icon:Tag}]:[]),{href:"/dashboard/orders",label:t("orders"),icon:ShoppingBag},{href:"/dashboard/customers",label:crm("nav"),icon:Users},{href:"/dashboard/analytics",label:t("analytics"),icon:BarChart3}];
  const manage = [{href:"/dashboard/branches",label:branches("nav"),icon:MapPinned},{href:"/dashboard/drivers",label:workflow("drivers"),icon:Bike},...(features.includes("REVIEWS")?[{href:"/dashboard/reviews",label:workflow("reviews"),icon:Star}]:[]),{href:"/dashboard/team",label:t("team"),icon:Users},{href:"/dashboard/subscription",label:plans("subscription"),icon:CreditCard},...(features.includes("CUSTOM_DOMAIN")?[{href:"/dashboard/domain",label:domains("nav"),icon:Globe2}]:[]),{href:"/dashboard/security",label:security("security"),icon:ShieldCheck},{href:"/dashboard/settings",label:t("settings"),icon:Settings}];
  const item = ({ href, label, icon: Icon }: (typeof workspace)[number]) =>
    <Link href={href} className={pathname === href ? "active" : undefined} aria-current={pathname === href ? "page" : undefined}>
      <Icon />{label}
    </Link>;
  return <nav><b>{t("workspace")}</b>{workspace.map(link => <span key={link.href}>{item(link)}</span>)}<b>{t("manage")}</b>{manage.map(link => <span key={link.href}>{item(link)}</span>)}</nav>;
}
