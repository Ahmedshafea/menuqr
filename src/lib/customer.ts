import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireCustomer() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.roles.includes("CUSTOMER")) redirect("/auth/continue");
  const profile = await prisma.customerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) throw new Error("Customer profile is missing");
  return { session, customerId: profile.id };
}
