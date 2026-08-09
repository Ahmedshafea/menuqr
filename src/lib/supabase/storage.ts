import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "./server";
import { rateLimit } from "@/lib/rate-limit";
import sharp from "sharp";

export const STORAGE_BUCKETS = ["restaurant-logos", "restaurant-covers", "product-images", "review-images"] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
type SupportedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";
const decodedFormats: Record<string, { contentType: SupportedImageType; extension: string }> = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
  heif: { contentType: "image/avif", extension: "avif" },
};

export async function normalizeUploadedImage(file: File) {
  if (!file.size) throw new Error("Images cannot be empty");
  if (!allowedTypes.has(file.type)) throw new Error("Only JPEG, PNG, WebP, and AVIF images are allowed");
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller");
  const input = Buffer.from(await file.arrayBuffer());
  const decoder = sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 });
  const metadata = await decoder.metadata().catch(() => { throw new Error("Invalid or corrupted image"); });
  const decoded = metadata.format ? decodedFormats[metadata.format] : undefined;
  if (!decoded || decoded.contentType !== file.type || !metadata.width || !metadata.height || metadata.width > 12_000 || metadata.height > 12_000)
    throw new Error("Invalid or unsupported image content");
  const suppliedExtension = file.name.split(".").pop()?.toLowerCase();
  if (!suppliedExtension || !([decoded.extension, ...(decoded.extension === "jpg" ? ["jpeg"] : [])].includes(suppliedExtension)))
    throw new Error("Image filename does not match its content");
  const oriented = decoder.rotate();
  const bytes = decoded.extension === "jpg" ? await oriented.jpeg({ quality: 85, mozjpeg: true }).toBuffer()
    : decoded.extension === "png" ? await oriented.png({ compressionLevel: 9 }).toBuffer()
      : decoded.extension === "webp" ? await oriented.webp({ quality: 85 }).toBuffer()
        : await oriented.avif({ quality: 60 }).toBuffer();
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Normalized image is too large");
  return { bytes, contentType: decoded.contentType, extension: decoded.extension };
}

export async function uploadRestaurantImage(input: { bucket: StorageBucket; restaurantId: string; file: File }) {
  if (!(await rateLimit(`storage-upload:${input.restaurantId}`, 30, 10 * 60 * 1000)).allowed) throw new Error("Too many uploads. Try again later");
  const normalized = await normalizeUploadedImage(input.file);
  const path = `${input.restaurantId}/${randomUUID()}.${normalized.extension}`;
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.storage.from(input.bucket).upload(path, normalized.bytes, { contentType: normalized.contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { bucket: input.bucket, path, url: supabase.storage.from(input.bucket).getPublicUrl(path).data.publicUrl };
}

export async function deleteRestaurantImage(bucket: StorageBucket, path: string, restaurantId: string) {
  if (!path.startsWith(`${restaurantId}/`) || path.includes("..")) throw new Error("Invalid storage path");
  const { error } = await createSupabaseAdmin().storage.from(bucket).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
