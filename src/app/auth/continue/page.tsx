import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function AuthContinuePage() {
  const session = await auth();
  if (!session) redirect("/login");
  const restaurantRole = session.user.roles.some((role) =>
    ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role),
  );
  redirect(restaurantRole && session.user.restaurantId ? "/dashboard" : "/account");
}
