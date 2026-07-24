import type { MetadataRoute } from "next";
import { demoRestaurantCards } from "@/lib/demo-restaurants";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...demoRestaurantCards.map((restaurant) => ({
      url: `${base}/menu/${restaurant.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    {
      url: `${base}/register`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
  ];
}
