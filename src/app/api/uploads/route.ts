import {
  STORAGE_BUCKETS,
  deleteRestaurantImage,
  uploadRestaurantImage,
  type StorageBucket,
} from "@/lib/supabase/storage";
import { apiError, logApiError, rateLimitError } from "@/lib/api";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { authorizeTenantApi } from "@/lib/current-authorization";

function isBucket(value: string): value is StorageBucket {
  return STORAGE_BUCKETS.includes(value as StorageBucket);
}
export async function POST(request: Request) {
  const access = await authorizeTenantApi();
  if (!access.ok) return access.response;
  const { restaurantId } = access;
  const limited = await rateLimit(
    `uploads:${restaurantId}:${requestIp(request)}`,
    20,
    10 * 60 * 1000,
  );
  if (!limited.allowed) return rateLimitError(limited.retryAfter);
  const form = await request.formData();
  const file = form.get("file");
  const bucket = form.get("bucket");
  if (
    !(file instanceof File) ||
    typeof bucket !== "string" ||
    !isBucket(bucket)
  )
    return apiError("INVALID_UPLOAD", 400);
  try {
    return Response.json(
      await uploadRestaurantImage({ bucket, restaurantId, file }),
      { status: 201 },
    );
  } catch (error) {
    logApiError("upload", error, { restaurantId });
    return apiError("UPLOAD_FAILED", 400);
  }
}

export async function DELETE(request: Request) {
  const access = await authorizeTenantApi();
  if (!access.ok) return access.response;
  const { restaurantId } = access;
  const body = (await request.json().catch(() => null)) as {
    bucket?: string;
    path?: string;
  } | null;
  if (!body?.bucket || !isBucket(body.bucket) || !body.path)
    return apiError("INVALID_DELETE", 400);
  try {
    await deleteRestaurantImage(body.bucket, body.path, restaurantId);
    return new Response(null, { status: 204 });
  } catch (error) {
    logApiError("upload-delete", error, { restaurantId });
    return apiError("DELETE_FAILED", 400);
  }
}
