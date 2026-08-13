import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const WORKSPACE_ACCESS_CHANGED = "WORKSPACE_ACCESS_CHANGED";

export async function getCurrentUserAuthorization() {
  const session = await auth();
  if (!session?.user?.id) return { status: "unauthenticated" as const };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      isActive: true,
      sessionVersion: true,
      roles: { select: { role: true } },
      restaurantMemberships: {
        select: { restaurantId: true, role: true, restaurant: { select: { isActive: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user?.isActive) return { status: "forbidden" as const, session };
  return {
    status: "authorized" as const,
    session,
    sessionVersion: user.sessionVersion,
    globalRoles: user.roles.map(({ role }) => role),
    memberships: user.restaurantMemberships,
  };
}

export async function getCurrentTenantAuthorization() {
  const current = await getCurrentUserAuthorization();
  if (current.status !== "authorized") return current;
  const hintedRestaurantId = current.session.user.restaurantId;
  if (!hintedRestaurantId) return { status: "forbidden" as const, session: current.session };
  const membership = current.memberships.find(({ restaurantId }) => restaurantId === hintedRestaurantId);
  const superAdmin = current.globalRoles.includes("SUPER_ADMIN");
  if ((!membership || !["RESTAURANT_OWNER", "STAFF"].includes(membership.role)) && !superAdmin)
    return { status: "forbidden" as const, session: current.session };
  if (membership && !membership.restaurant.isActive)
    return { status: "forbidden" as const, session: current.session };
  return { ...current, status: "authorized" as const, restaurantId: hintedRestaurantId, membershipRole: membership?.role ?? null };
}

export async function authorizeTenantApi() {
  const current = await getCurrentTenantAuthorization();
  if (current.status === "unauthenticated")
    return { ok: false as const, response: Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  if (current.status !== "authorized")
    return { ok: false as const, response: Response.json({ error: { code: WORKSPACE_ACCESS_CHANGED } }, { status: 403 }) };
  return { ok: true as const, ...current };
}
