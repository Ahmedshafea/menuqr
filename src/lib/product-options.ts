import type { Prisma } from "@prisma/client";

export type ProductOptionsInput = {
  id?: string;
  name: string;
  nameAr?: string;
  required: boolean;
  min: number;
  max: number;
  options: {
    id?: string;
    name?: string;
    nameAr?: string;
    price?: number;
  }[];
}[];

export function parseProductOptions(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value || "[]")) as ProductOptionsInput;
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export async function syncProductOptions(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  productId: string,
  groups: ProductOptionsInput,
) {
  const attached: string[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const input = groups[groupIndex];
    const name = String(input.name || "").trim().slice(0, 100);
    if (name.length < 2) continue;
    const existingGroup = input.id
      ? await tx.productOptionGroup.findFirst({
          where: { id: input.id, restaurantId },
          select: { id: true },
        })
      : null;
    const requestedMin = Math.max(
      0,
      Math.min(20, Number(input.min) || 0),
    );
    const min = input.required ? Math.max(1, requestedMin) : 0;
    const max = Math.max(min, Math.min(20, Number(input.max) || 1));
    const group = existingGroup
      ? await tx.productOptionGroup.update({
          where: { id: existingGroup.id },
          data: {
            name,
            nameAr: String(input.nameAr || "").trim().slice(0, 100) || null,
            isRequired: Boolean(input.required),
            minSelections: min,
            maxSelections: max,
            sortOrder: groupIndex,
          },
          select: { id: true },
        })
      : await tx.productOptionGroup.create({
          data: {
            restaurantId,
            name,
            nameAr: String(input.nameAr || "").trim().slice(0, 100) || null,
            isRequired: Boolean(input.required),
            minSelections: min,
            maxSelections: max,
            sortOrder: groupIndex,
          },
          select: { id: true },
        });
    attached.push(group.id);
    await tx.productOptionGroupProduct.upsert({
      where: { groupId_productId: { groupId: group.id, productId } },
      create: { groupId: group.id, productId, sortOrder: groupIndex },
      update: { sortOrder: groupIndex },
    });
    const optionIds: string[] = [];
    for (let optionIndex = 0; optionIndex < input.options.length; optionIndex++) {
      const inputOption = input.options[optionIndex];
      const existing = inputOption.id
        ? await tx.productOption.findFirst({
            where: { id: inputOption.id, restaurantId },
            select: { id: true },
          })
        : null;
      const optionName = String(inputOption.name || "").trim().slice(0, 100);
      if (!existing && optionName.length < 2) continue;
      const option = existing
        ? existing
        : await tx.productOption.create({
            data: {
              restaurantId,
              name: optionName,
              nameAr:
                String(inputOption.nameAr || "").trim().slice(0, 100) || null,
              priceAdjustment: Number(inputOption.price) || 0,
              sortOrder: optionIndex,
            },
            select: { id: true },
          });
      optionIds.push(option.id);
      await tx.productOptionGroupItem.upsert({
        where: { groupId_optionId: { groupId: group.id, optionId: option.id } },
        create: { groupId: group.id, optionId: option.id, sortOrder: optionIndex },
        update: { sortOrder: optionIndex },
      });
    }
    await tx.productOptionGroupItem.deleteMany({
      where: { groupId: group.id, optionId: { notIn: optionIds } },
    });
  }
  await tx.productOptionGroupProduct.deleteMany({
    where: { productId, groupId: { notIn: attached } },
  });
}
