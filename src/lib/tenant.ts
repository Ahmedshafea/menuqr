import { auth } from "@/auth";
import { redirect } from "next/navigation";

export async function requireTenant() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.restaurantId) throw new Error("Authenticated user has no restaurant workspace");
  return { session, restaurantId: session.user.restaurantId };
}
