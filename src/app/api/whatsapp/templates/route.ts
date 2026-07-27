import { auth } from "@/auth";
import { apiError, logApiError } from "@/lib/api";
import { listTemplates, WhatsAppError } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user.restaurantId || !session.user.roles.some((role) => ["RESTAURANT_OWNER", "STAFF", "SUPER_ADMIN"].includes(role)))
    return apiError("UNAUTHORIZED", 401);
  try {
    return Response.json(await listTemplates());
  } catch (error) {
    logApiError("whatsapp-templates", error, { restaurantId: session.user.restaurantId });
    if (error instanceof WhatsAppError) return apiError(error.code, error.status);
    return apiError("WHATSAPP_TEMPLATES_FAILED", 500);
  }
}

