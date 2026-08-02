import Link from "next/link";
import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { auth, signOut } from "@/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import "./dashboard.css";
import "./product-form.css";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { RestaurantNotificationCenter } from "@/components/restaurant-notification-center";

import { DashboardWrapper } from "@/components/dashboard-wrapper";
import { ensureRestaurantSubscription } from "@/lib/subscription-plans";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const [t, notificationsText, notifications, subscription] = await Promise.all([
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
    session.user.restaurantId
      ? ensureRestaurantSubscription(session.user.restaurantId)
      : Promise.resolve(null),
  ]);
  const notificationItems = notifications.map(({ reads, createdAt, ...item }) => ({
    ...item,
    createdAt: createdAt.toISOString(),
    unread: reads.length === 0,
  }));

  const brand = (
    <Link href="/" className="brand">
      <span><QrCode /></span>
      MenuQR
    </Link>
  );

  const notificationCenter = (
    <RestaurantNotificationCenter 
      items={notificationItems} 
      labels={{
        title: notificationsText("title"),
        empty: notificationsText("empty"),
        markRead: notificationsText("markRead")
      }} 
    />
  );

  const signOutAction = async () => { 
    "use server"; 
    await signOut({ redirectTo: "/" }); 
  };

  return (
    <DashboardWrapper
      brand={brand}
      notifications={notificationCenter}
      sidebar={<DashboardSidebar features={subscription?.plan.features.map((item) => item.feature.key) ?? []} />}
      languageSwitcher={<LanguageSwitcher compact />}
      signOutAction={signOutAction}
      signOutLabel={t("signOut")}
    >
      {children}
    </DashboardWrapper>
  );
}
