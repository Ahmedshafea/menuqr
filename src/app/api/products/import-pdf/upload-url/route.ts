import { randomUUID } from "node:crypto";
import { authorizeTenantApi } from "@/lib/current-authorization";
import { apiError, rateLimitError } from "@/lib/api";
import { PDF_IMPORT_BUCKET } from "@/lib/pdf-menu-import";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/subscription-plans";
import { beginImportOperation } from "@/lib/import-guard";

export const runtime = "nodejs";

export async function POST() {
  const access = await authorizeTenantApi();
  if (!access.ok) return access.response;
  const { restaurantId, session } = access;
  if (!(await hasFeature(restaurantId, "PDF_IMPORT"))) return apiError("FEATURE_NOT_AVAILABLE", 403);
  const guard = await beginImportOperation(session.user.id, restaurantId, "pdf-upload");
  if (!guard.allowed) return guard.reason === "rate" ? rateLimitError(guard.retryAfter) : apiError("IMPORT_IN_PROGRESS", 409);
  try {
  const limit = await rateLimit(`pdf-import-upload:${restaurantId}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimitError(limit.retryAfter);
  const path = `${restaurantId}/${randomUUID()}.pdf`;
  const { data, error } = await createSupabaseAdmin().storage
    .from(PDF_IMPORT_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return apiError("PDF_UPLOAD_UNAVAILABLE", 503);
  return Response.json({ path, token: data.token, signedUrl: data.signedUrl });
  } finally {
    await guard.release();
  }
}
