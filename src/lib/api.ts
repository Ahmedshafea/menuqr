export function apiError(code: string, status: number, details?: unknown) {
  return Response.json(
    { error: { code, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

export function rateLimitError(retryAfter: number) {
  return Response.json(
    { error: { code: "RATE_LIMITED" } },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export function logApiError(
  context: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
) {
  console.error(
    JSON.stringify({
      level: "error",
      context,
      message: error instanceof Error ? error.message : String(error),
      ...metadata,
      timestamp: new Date().toISOString(),
    }),
  );
}
