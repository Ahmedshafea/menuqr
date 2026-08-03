import { forbidden } from "next/navigation";
import { auth } from "@/auth";

export async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user.roles.includes("SUPER_ADMIN")) forbidden();
  return session;
}
