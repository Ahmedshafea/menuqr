import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/subscription-plans";
import { normalizeCustomDomain } from "@/lib/custom-domains";
import { renderMenuPage } from "@/components/public-menu-page";

export const revalidate = 60;

const resolveDomain = unstable_cache(async (domain: string) => {
  const record = await prisma.customDomain.findUnique({
    where: { domain, status: "VERIFIED" },
    select: { restaurantId: true, restaurant: { select: { slug: true, isActive: true } } },
  });
  if (!record?.restaurant.isActive || !(await hasFeature(record.restaurantId, "CUSTOM_DOMAIN"))) return null;
  return record.restaurant.slug;
}, ["custom-domain-resolution"], { revalidate: 60, tags: ["custom-domains"] });

export default async function CustomDomainMenu({ params, searchParams }: { params: Promise<{ hostname: string }>; searchParams: Promise<{ reorder?: string; extras?: string; checkout?: string }> }) {
  const raw = decodeURIComponent((await params).hostname);
  let hostname: string;
  try { hostname = normalizeCustomDomain(raw); } catch { notFound(); }
  const requestHeaders = await headers();
  const requestHostname = (requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "").split(":")[0].toLowerCase();
  if (requestHostname !== hostname) notFound();
  const slug = await resolveDomain(hostname);
  if (!slug) notFound();
  return renderMenuPage({ restaurantSlug: slug, searchParams, customOrigin: `https://${hostname}` });
}
