import { forbidden, redirect } from "next/navigation";
import { canPerformTenantAction } from "@/lib/authorization-policy";
import { getCurrentTenantAuthorization } from "@/lib/current-authorization";

export async function requireTenant() {
  const current = await getCurrentTenantAuthorization();
  if (current.status === "unauthenticated") redirect("/login");
  if (current.status !== "authorized") {
    console.warn(JSON.stringify({ level: "warn", context: "authorization", event: "tenant_action_rejected", userId: current.session?.user.id, timestamp: new Date().toISOString() }));
    forbidden();
  }
  return { session: current.session, restaurantId: current.restaurantId, globalRoles: current.globalRoles, membershipRole: current.membershipRole };
}

export async function requireOwner() {
  const { session, restaurantId, globalRoles, membershipRole } = await requireTenant();
  if (!canPerformTenantAction({ globalRoles, membershipRole }, true)) {
    console.warn(JSON.stringify({ level: "warn", context: "authorization", event: "owner_action_rejected", userId: session.user.id, restaurantId, timestamp: new Date().toISOString() }));
    forbidden();
  }
  return { session, restaurantId };
}
