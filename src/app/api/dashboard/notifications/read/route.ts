import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";

const schema = z.object({ ids: z.array(z.string().min(1)).max(50) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.restaurantId) return apiError("UNAUTHORIZED", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_REQUEST", 400);
  const notifications = await prisma.restaurantNotification.findMany({
    where: {
      id: { in: parsed.data.ids },
      restaurantId: session.user.restaurantId,
    },
    select: { id: true },
  });
  await prisma.restaurantNotificationRead.createMany({
    data: notifications.map(({ id }) => ({
      notificationId: id,
      userId: session.user.id,
    })),
    skipDuplicates: true,
  });
  return new Response(null, { status: 204 });
}
