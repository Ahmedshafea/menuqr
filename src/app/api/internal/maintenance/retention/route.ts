import { createHash, timingSafeEqual } from "node:crypto";
import { apiError, logApiError } from "@/lib/api";
import { cleanupOperationalRecords } from "@/lib/operational-retention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request) {
  const configured = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configured || !authorization?.startsWith("Bearer ")) return false;
  const expected = createHash("sha256").update(configured).digest();
  const supplied = createHash("sha256").update(authorization.slice(7)).digest();
  return timingSafeEqual(expected, supplied);
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  if (!authorized(request)) return apiError("UNAUTHORIZED", 401, { requestId });
  try {
    const removed = await cleanupOperationalRecords();
    console.info(JSON.stringify({ level: "info", context: "operational-retention", event: "cleanup_completed", requestId, removed, timestamp: new Date().toISOString() }));
    return Response.json({ ok: true, removed, requestId });
  } catch (error) {
    logApiError("operational-retention", error, { requestId });
    return apiError("RETENTION_CLEANUP_FAILED", 500, { requestId });
  }
}
