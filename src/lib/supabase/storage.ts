import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "./server";
import { rateLimit } from "@/lib/rate-limit";

export const STORAGE_BUCKETS = ["restaurant-logos", "restaurant-covers", "product-images", "review-images"] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

export async function uploadRestaurantImage(input: { bucket: StorageBucket; restaurantId: string; file: File }) {
  if (!(await rateLimit(`storage-upload:${input.restaurantId}`, 30, 10 * 60 * 1000)).allowed) throw new Error("Too many uploads. Try again later");
  if (!allowedTypes.has(input.file.type)) throw new Error("Only JPEG, PNG, WebP, and AVIF images are allowed");
  if (input.file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller");
  const path = `${input.restaurantId}/${randomUUID()}.${extensions[input.file.type]}`;
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.storage.from(input.bucket).upload(path, input.file, { contentType: input.file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { bucket: input.bucket, path, url: supabase.storage.from(input.bucket).getPublicUrl(path).data.publicUrl };
}

export async function deleteRestaurantImage(bucket: StorageBucket, path: string, restaurantId: string) {
  if (!path.startsWith(`${restaurantId}/`) || path.includes("..")) throw new Error("Invalid storage path");
  const { error } = await createSupabaseAdmin().storage.from(bucket).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
