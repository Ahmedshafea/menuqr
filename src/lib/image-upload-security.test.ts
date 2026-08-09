import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), publicUrl: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdmin: () => ({ storage: { from: () => ({ upload: mocks.upload, getPublicUrl: mocks.publicUrl }) } }) }));

import { normalizeUploadedImage, uploadRestaurantImage } from "@/lib/supabase/storage";

const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as BlobPart], name, { type });

describe("decoded image upload validation", () => {
  beforeEach(() => {
    mocks.upload.mockReset().mockResolvedValue({ error: null });
    mocks.publicUrl.mockReset().mockReturnValue({ data: { publicUrl: "https://storage.test/image" } });
  });

  it.each([
    ["image/png", "png", "png"],
    ["image/jpeg", "jpg", "jpeg"],
    ["image/webp", "webp", "webp"],
    ["image/avif", "avif", "avif"],
  ] as const)("decodes and normalizes valid %s", async (type, extension, format) => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).toFormat(format).toBuffer();
    const normalized = await normalizeUploadedImage(file(new Uint8Array(bytes), `valid.${extension}`, type));
    expect(normalized).toMatchObject({ contentType: type, extension });
    expect(normalized.bytes.byteLength).toBeGreaterThan(0);
  });

  it.each([
    [new TextEncoder().encode("random bytes"), "bad.png", "image/png"],
    [new TextEncoder().encode("random bytes"), "bad.jpg", "image/jpeg"],
    [new TextEncoder().encode("<html><script>alert(1)</script>"), "bad.png", "image/png"],
    [new TextEncoder().encode("javascript:alert(1)"), "bad.png", "image/png"],
    [new Uint8Array(), "empty.png", "image/png"],
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "truncated.png", "image/png"],
    [new Uint8Array([255, 216, 255]), "truncated.jpg", "image/jpeg"],
  ])("rejects malformed content %#", async (bytes, name, type) => {
    await expect(normalizeUploadedImage(file(bytes, name, type))).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects oversized input and content/filename mismatches", async () => {
    await expect(normalizeUploadedImage(file(new Uint8Array(5 * 1024 * 1024 + 1), "large.png", "image/png"))).rejects.toThrow("5 MB");
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "blue" } }).png().toBuffer();
    await expect(normalizeUploadedImage(file(new Uint8Array(png), "wrong.jpg", "image/png"))).rejects.toThrow("filename");
  });

  it("uploads normalized bytes to a server-generated tenant path only after validation", async () => {
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "blue" } }).png().toBuffer();
    const result = await uploadRestaurantImage({ bucket: "product-images", restaurantId: "tenant-a", file: file(new Uint8Array(png), "valid.png", "image/png") });
    expect(result.path).toMatch(/^tenant-a\/[0-9a-f-]+\.png$/);
    expect(mocks.upload).toHaveBeenCalledWith(result.path, expect.any(Buffer), expect.objectContaining({ contentType: "image/png", upsert: false }));
  });

  it("returns no public URL when storage rejects the normalized image", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "rejected" } });
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "blue" } }).png().toBuffer();
    await expect(uploadRestaurantImage({ bucket: "product-images", restaurantId: "tenant-a", file: file(new Uint8Array(png), "valid.png", "image/png") })).rejects.toThrow("Storage upload failed");
    expect(mocks.publicUrl).not.toHaveBeenCalled();
  });
});
