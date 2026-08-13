import { authorizeTenantApi } from "@/lib/current-authorization";
import { apiError, logApiError } from "@/lib/api";
import { listTemplates, WhatsAppError } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET() {
  const access = await authorizeTenantApi();
  if (!access.ok) return access.response;
  const { restaurantId } = access;
  try {
    return Response.json(await listTemplates());
  } catch (error) {
    logApiError("whatsapp-templates", error, { restaurantId });
    if (error instanceof WhatsAppError) return apiError(error.code, error.status);
    return apiError("WHATSAPP_TEMPLATES_FAILED", 500);
  }
}
