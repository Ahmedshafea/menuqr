import type { Prisma } from "@prisma/client";
import type { BranchInput } from "@/lib/branch-validation";

export function branchWriteData(input: BranchInput) {
  return {
    name: input.name,
    slug: input.slug,
    phone: input.phone,
    whatsappNumber: input.useRestaurantWhatsapp ? null : input.whatsappNumber,
    useRestaurantWhatsapp: input.useRestaurantWhatsapp,
    email: input.email,
    address: input.address,
    city: input.city,
    state: input.state,
    country: input.country,
    postalCode: input.postalCode,
    latitude: input.latitude,
    longitude: input.longitude,
    googleMapsUrl: input.googleMapsUrl,
    isActive: input.isActive,
  } satisfies Prisma.BranchUncheckedUpdateInput;
}

export function branchWhatsapp(
  branch: {
    useRestaurantWhatsapp: boolean;
    whatsappNumber: string | null;
  } | null,
  restaurantWhatsapp: string,
) {
  return branch && !branch.useRestaurantWhatsapp && branch.whatsappNumber
    ? branch.whatsappNumber
    : restaurantWhatsapp;
}
