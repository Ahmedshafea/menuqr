import { auth } from "@/auth";
import { forbidden, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canPerformTenantAction } from "@/lib/authorization-policy";

export async function requireTenant() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    redirect("/account");
  if (!session.user.restaurantId) throw new Error("Authenticated user has no restaurant workspace");
  return { session, restaurantId: session.user.restaurantId };
}

export async function requireOwner() {
  const { session, restaurantId } = await requireTenant();
  const membership = await prisma.restaurantMember.findUnique({
    where: { userId_restaurantId: { userId: session.user.id, restaurantId } },
    select: { role: true },
  });
  if (!canPerformTenantAction({ globalRoles: session.user.roles, membershipRole: membership?.role }, true)) {
    console.warn(JSON.stringify({ level: "warn", context: "authorization", event: "owner_action_rejected", userId: session.user.id, restaurantId, timestamp: new Date().toISOString() }));
    forbidden();
  }
  return { session, restaurantId };
}
