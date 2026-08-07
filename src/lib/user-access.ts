import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// JWT sessions remain low-cost while account suspension and role changes are
// reflected within at most one minute across all active devices.
export const getCachedUserAccess = unstable_cache(
  async (userId: string) => prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      roles: { select: { role: true } },
      restaurantMemberships: {
        select: { restaurantId: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  }),
  ["authenticated-user-access-v1"],
  { revalidate: 60, tags: ["user-access"] },
);
