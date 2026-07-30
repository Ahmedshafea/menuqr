import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import {
  getRestaurant,
  renderMenuPage,
} from "@/components/public-menu-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; branchSlug: string }>;
}): Promise<Metadata> {
  const { slug, branchSlug } = await params;
  const [restaurant, locale] = await Promise.all([
    getRestaurant(slug),
    getLocale(),
  ]);
  if (!restaurant) return {};
  const branch = restaurant.branches.find(
    (item) => "slug" in item && item.slug === branchSlug,
  );
  const restaurantName =
    locale === "ar" && restaurant.nameAr ? restaurant.nameAr : restaurant.name;
  return {
    title: `${branch && "name" in branch ? branch.name : branchSlug} — ${restaurantName} | MenuQR`,
    description:
      locale === "ar"
        ? (restaurant.descriptionAr ?? restaurant.description ?? undefined)
        : (restaurant.description ?? undefined),
  };
}

export default async function BranchMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; branchSlug: string }>;
  searchParams: Promise<{
    reorder?: string;
    extras?: string;
    checkout?: string;
  }>;
}) {
  const { slug, branchSlug } = await params;
  return renderMenuPage({
    restaurantSlug: slug,
    branchSlug,
    searchParams,
  });
}
