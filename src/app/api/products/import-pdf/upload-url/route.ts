import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { apiError, rateLimitError } from "@/lib/api";
import { PDF_IMPORT_BUCKET } from "@/lib/pdf-menu-import";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const restaurantId = session?.user.restaurantId;
  if (!restaurantId || !session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    return apiError("UNAUTHORIZED", 401);
  const limit = rateLimit(`pdf-import-upload:${restaurantId}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimitError(limit.retryAfter);
  const path = `${restaurantId}/${randomUUID()}.pdf`;
  const { data, error } = await createSupabaseAdmin().storage
    .from(PDF_IMPORT_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return apiError("PDF_UPLOAD_UNAVAILABLE", 503);
  return Response.json({ path, token: data.token, signedUrl: data.signedUrl });
}

