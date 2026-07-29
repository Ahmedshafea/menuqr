import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function OrderReviewLink({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await prisma.order.findUnique({
    where: { accessToken: token },
    select: { restaurant: { select: { slug: true } } },
  });
  if (!order) notFound();
  redirect(`/r/${order.restaurant.slug}/review?order=${encodeURIComponent(token)}`);
}
