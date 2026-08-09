export const allowedImageHost = (hostname: string) =>
  hostname === "images.unsplash.com" || hostname.endsWith(".supabase.co");
