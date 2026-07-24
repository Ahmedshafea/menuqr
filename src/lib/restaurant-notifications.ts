import { Prisma, RestaurantNotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Client = Prisma.TransactionClient | typeof prisma;

export async function createRestaurantNotification(
  client: Client,
  data: {
    restaurantId: string;
    type: RestaurantNotificationType;
    title: string;
    body?: string;
    href?: string;
    dedupeKey?: string;
  },
) {
  if (data.dedupeKey)
    return client.restaurantNotification.upsert({
      where: {
        restaurantId_dedupeKey: {
          restaurantId: data.restaurantId,
          dedupeKey: data.dedupeKey,
        },
      },
      create: data,
      update: {},
    });
  return client.restaurantNotification.create({ data });
}
