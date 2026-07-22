-- Run once in the Supabase SQL Editor after the Prisma migrations.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('restaurant-logos', 'restaurant-logos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/avif']),
  ('restaurant-covers', 'restaurant-covers', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/avif']),
  ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public images are readable by menus. Writes are intentionally not granted to
-- anon/authenticated Supabase roles: MenuQR uploads through its authenticated
-- server endpoint using the service-role key after Auth.js tenant checks.
DROP POLICY IF EXISTS "Public restaurant images" ON storage.objects;
CREATE POLICY "Public restaurant images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('restaurant-logos', 'restaurant-covers', 'product-images'));
