import { z } from "zod";
import { authorizeTenantApi } from "@/lib/current-authorization";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { extractMenuFromPdf } from "@/lib/gemini-menu-import";
import { assertPdfFile, MAX_PDF_MENU_BYTES, PDF_IMPORT_BUCKET } from "@/lib/pdf-menu-import";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/subscription-plans";
import { beginImportOperation } from "@/lib/import-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({ path: z.string().min(1).max(300) });

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : "PDF_IMPORT_FAILED";
}

export async function POST(request: Request) {
  const access = await authorizeTenantApi();
  if (!access.ok) return access.response;
  const { restaurantId, session } = access;
  if (!(await hasFeature(restaurantId, "PDF_IMPORT"))) return apiError("FEATURE_NOT_AVAILABLE", 403);
  const guard = await beginImportOperation(session.user.id, restaurantId, "pdf-analyze");
  if (!guard.allowed) return guard.reason === "rate" ? rateLimitError(guard.retryAfter) : apiError("IMPORT_IN_PROGRESS", 409);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.path.startsWith(`${restaurantId}/`) || !parsed.data.path.endsWith(".pdf") || parsed.data.path.includes("..")) {
    await guard.release();
    return apiError("INVALID_PDF_PATH", 400);
  }
  const supabase = createSupabaseAdmin();
  try {
    const { data, error } = await supabase.storage.from(PDF_IMPORT_BUCKET).download(parsed.data.path);
    if (error || !data) return apiError("PDF_UPLOAD_NOT_FOUND", 404);
    const bytes = new Uint8Array(await data.arrayBuffer());
    assertPdfFile({ size: bytes.byteLength, type: data.type, name: parsed.data.path }, bytes);
    if (bytes.byteLength > MAX_PDF_MENU_BYTES) return apiError("PDF_TOO_LARGE", 413);
    const menu = await extractMenuFromPdf(bytes);
    return Response.json(menu);
  } catch (error) {
    const code = errorCode(error);
    logApiError("pdf-menu-import", error, { restaurantId });
    const status = code === "GEMINI_QUOTA_EXCEEDED" ? 429 : code === "GEMINI_NOT_CONFIGURED" ? 503 : 422;
    return apiError(code, status);
  } finally {
    await supabase.storage.from(PDF_IMPORT_BUCKET).remove([parsed.data.path]);
    await guard.release();
  }
}
