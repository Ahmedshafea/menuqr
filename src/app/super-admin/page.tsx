import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function SuperAdminOverview() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const [restaurants, users, orders, todayOrders, paidSubscriptions, monthlyRevenue, flags, settings, latest] = await Promise.all([
    prisma.restaurant.count(),
    prisma.user.count(),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: today } } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] }, plan: { price: { gt: 0 } } } }),
    prisma.payment.aggregate({ where: { status: "PAID", createdAt: { gte: month } }, _sum: { amount: true } }),
    prisma.featureFlag.count({ where: { enabled: true } }),
    prisma.platformSetting.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, entity: true, createdAt: true, user: { select: { name: true } } } }),
  ]);
  const stats = [
    ["المطاعم", restaurants], ["المستخدمون", users], ["إجمالي الطلبات", orders], ["طلبات اليوم", todayOrders],
    ["اشتراكات مدفوعة", paidSubscriptions], ["إيراد الشهر", `${Number(monthlyRevenue._sum.amount ?? 0).toLocaleString("ar-EG")} ج.م`],
    ["المزايا المفعلة", flags], ["إعدادات ديناميكية", settings],
  ];
  return <>
    <header className="admin-header"><div><h1>لوحة إدارة المنصة</h1><p>نظرة مركزية على MenuQR وإعداداته الفعلية.</p></div><Link className="admin-button" href="/super-admin/configuration">إدارة الإعدادات</Link></header>
    <section className="admin-stats">{stats.map(([label, value]) => <article className="admin-card admin-stat" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="admin-card admin-section"><header><h2>حالة المنصة</h2><span className="admin-pill">تعمل بصورة طبيعية</span></header><p>يتم تخزين الإعدادات في PostgreSQL وقراءتها من كاش قصير المدة، مع إبطال فوري للكاش عند أي تعديل إداري.</p></section>
    <section className="admin-card admin-section"><header><h2>أحدث الأنشطة الإدارية</h2><Link href="/super-admin/audit-logs">عرض الكل</Link></header>
      <table className="admin-table"><thead><tr><th>المستخدم</th><th>الإجراء</th><th>المورد</th><th>الوقت</th></tr></thead><tbody>{latest.map((item) => <tr key={item.id}><td data-label="المستخدم">{item.user?.name ?? "النظام"}</td><td data-label="الإجراء">{item.action}</td><td data-label="المورد">{item.entity}</td><td data-label="الوقت">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</td></tr>)}</tbody></table>
    </section>
  </>;
}
