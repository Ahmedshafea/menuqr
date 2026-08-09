import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { branchSchema } from "@/lib/branch-validation";
import { branchWriteData } from "@/lib/branches";
import { prisma } from "@/lib/prisma";
import { requireOwner, requireTenant } from "@/lib/tenant";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { restaurantId } = await requireTenant();
  const branch = await prisma.branch.findFirst({
    where: { id: (await params).id, restaurantId },
    include: { workingHours: { orderBy: { dayOfWeek: "asc" } } },
  });
  if (!branch) return apiError("BRANCH_NOT_FOUND", 404);
  return Response.json(branch);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { restaurantId } = await requireOwner();
  const id = (await params).id;
  const parsed = branchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return apiError("INVALID_BRANCH", 400, parsed.error.flatten().fieldErrors);
  const existing = await prisma.branch.findFirst({
    where: { id, restaurantId },
    select: { id: true, isActive: true },
  });
  if (!existing) return apiError("BRANCH_NOT_FOUND", 404);
  if (existing.isActive && !parsed.data.isActive) {
    const active = await prisma.branch.count({ where: { restaurantId, isActive: true } });
    if (active <= 1) return apiError("LAST_ACTIVE_BRANCH", 409);
  }
  try {
    await prisma.$transaction([
      prisma.branch.update({ where: { id }, data: branchWriteData(parsed.data) }),
      prisma.workingHour.deleteMany({ where: { branchId: id } }),
      ...(parsed.data.workingHours.length
        ? [
            prisma.workingHour.createMany({
              data: parsed.data.workingHours.map((hour) => ({
                branchId: id,
                dayOfWeek: hour.dayOfWeek,
                opensAt: hour.isClosed ? null : hour.opensAt,
                closesAt: hour.isClosed ? null : hour.closesAt,
                isClosed: hour.isClosed,
              })),
            }),
          ]
        : []),
    ]);
    revalidatePath("/dashboard/branches");
    revalidateTag("public-menu");
    return Response.json({ id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return apiError("BRANCH_SLUG_EXISTS", 409);
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { restaurantId } = await requireOwner();
  const id = (await params).id;
  const branch = await prisma.branch.findFirst({
    where: { id, restaurantId },
    select: { id: true, isActive: true },
  });
  if (!branch) return apiError("BRANCH_NOT_FOUND", 404);
  if (branch.isActive) {
    const active = await prisma.branch.count({ where: { restaurantId, isActive: true } });
    if (active <= 1) return apiError("LAST_ACTIVE_BRANCH", 409);
  }
  await prisma.branch.delete({ where: { id } });
  revalidatePath("/dashboard/branches");
  revalidateTag("public-menu");
  return Response.json({ deleted: true });
}
