import { z } from "zod";
import { auth } from "@/auth";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { extractMenuFromPdf } from "@/lib/gemini-menu-import";
import { assertPdfFile, MAX_PDF_MENU_BYTES, PDF_IMPORT_BUCKET } from "@/lib/pdf-menu-import";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/subscription-plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({ path: z.string().min(1).max(300) });

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : "PDF_IMPORT_FAILED";
}

export async function POST(request: Request) {
  const session = await auth();
  const restaurantId = session?.user.restaurantId;
  if (!restaurantId || !session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    return apiError("UNAUTHORIZED", 401);
  if (!(await hasFeature(restaurantId, "PDF_IMPORT"))) return apiError("FEATURE_NOT_AVAILABLE", 403);
  const limit = rateLimit(`pdf-import-analyze:${restaurantId}`, 3, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimitError(limit.retryAfter);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.path.startsWith(`${restaurantId}/`) || !parsed.data.path.endsWith(".pdf") || parsed.data.path.includes(".."))
    return apiError("INVALID_PDF_PATH", 400);
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
  }
}
