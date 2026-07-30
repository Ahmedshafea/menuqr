import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { branchListQuerySchema, branchSchema } from "@/lib/branch-validation";
import { branchWriteData } from "@/lib/branches";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export async function GET(request: Request) {
  const { restaurantId } = await requireTenant();
  const url = new URL(request.url);
  const query = branchListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return apiError("INVALID_QUERY", 400);
  const { q, page, take } = query.data;
  const where: Prisma.BranchWhereInput = {
    restaurantId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        whatsappNumber: true,
        useRestaurantWhatsapp: true,
        address: true,
        city: true,
        isActive: true,
        updatedAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.branch.count({ where }),
  ]);
  return Response.json({ items, total, page, pages: Math.max(1, Math.ceil(total / take)) });
}

export async function POST(request: Request) {
  const { restaurantId } = await requireTenant();
  const parsed = branchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BRANCH", 400, parsed.error.flatten().fieldErrors);
  try {
    const branch = await prisma.$transaction(async (transaction) => {
      const created = await transaction.branch.create({
        data: { restaurantId, ...branchWriteData(parsed.data) },
        select: { id: true, slug: true },
      });
      if (parsed.data.workingHours.length)
        await transaction.workingHour.createMany({
          data: parsed.data.workingHours.map((hour) => ({
            branchId: created.id,
            dayOfWeek: hour.dayOfWeek,
            opensAt: hour.isClosed ? null : hour.opensAt,
            closesAt: hour.isClosed ? null : hour.closesAt,
            isClosed: hour.isClosed,
          })),
        });
      return created;
    });
    revalidatePath("/dashboard/branches");
    revalidateTag("public-menu");
    return Response.json(branch, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return apiError("BRANCH_SLUG_EXISTS", 409);
    throw error;
  }
}
