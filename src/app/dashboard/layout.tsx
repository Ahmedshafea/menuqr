import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, QrCode } from "lucide-react";
import { auth, signOut } from "@/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import "./dashboard.css";
import "./product-form.css";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { RestaurantNotificationCenter } from "@/components/restaurant-notification-center";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const [t, notificationsText, notifications] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("mvpPolish.notifications"),
    session.user.restaurantId
      ? prisma.restaurantNotification.findMany({
          where: { restaurantId: session.user.restaurantId },
          orderBy: { createdAt: "desc" },
          take: 15,
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            href: true,
            createdAt: true,
            reads: {
              where: { userId: session.user.id },
              select: { readAt: true },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const notificationItems = notifications.map(({ reads, createdAt, ...item }) => ({
    ...item,
    createdAt: createdAt.toISOString(),
    unread: reads.length === 0,
  }));
  return <main className="dash"><aside className="dash-side"><div className="dash-brand-row"><Link href="/" className="brand"><span><QrCode /></span>MenuQR</Link><RestaurantNotificationCenter items={notificationItems} labels={{title:notificationsText("title"),empty:notificationsText("empty"),markRead:notificationsText("markRead")}} /></div><LanguageSwitcher compact/><DashboardSidebar /><form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button><LogOut />{t("signOut")}</button></form></aside>{children}</main>;
}
