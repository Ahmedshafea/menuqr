import { forbidden } from "next/navigation";
import { getCurrentUserAuthorization } from "@/lib/current-authorization";

export async function requireSuperAdmin() {
  const current = await getCurrentUserAuthorization();
  if (current.status !== "authorized" || !current.globalRoles.includes("SUPER_ADMIN")) forbidden();
  current.session.user.roles = current.globalRoles;
  return current.session;
}
