import Link from "next/link";
import { Activity, Building2, CreditCard, FileClock, Flag, LayoutDashboard, ReceiptText, Settings2, Users } from "lucide-react";
import { requireSuperAdmin } from "@/lib/super-admin";
import "./super-admin.css";

const navigation = [
  ["/super-admin", "نظرة عامة", LayoutDashboard],
  ["/super-admin/users", "المستخدمون", Users],
  ["/super-admin/restaurants", "المطاعم والفروع", Building2],
  ["/super-admin/orders", "الطلبات", ReceiptText],
  ["/super-admin/configuration", "الإعدادات الديناميكية", Settings2],
  ["/super-admin/plans", "الخطط والمزايا", CreditCard],
  ["/super-admin/configuration#flags", "Feature Flags", Flag],
  ["/super-admin/audit-logs", "سجل الإدارة", FileClock],
] as const;

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return <div className="super-admin-shell" dir="rtl">
    <aside>
      <Link href="/super-admin" className="super-admin-brand"><Activity /> MenuQR Admin</Link>
      <nav>{navigation.map(([href, label, Icon]) => <Link href={href} key={href}><Icon />{label}</Link>)}</nav>
      <Link href="/dashboard" className="back-link">العودة للوحة المطعم</Link>
    </aside>
    <main>{children}</main>
  </div>;
}
