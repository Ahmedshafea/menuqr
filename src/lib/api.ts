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
  const candidate = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const errorCode = /^[A-Z][A-Z0-9_]{2,80}$/.test(candidate)
    ? candidate
    : error instanceof Error
      ? error.name || "Error"
      : "UNKNOWN_ERROR";
  console.error(
    JSON.stringify({
      level: "error",
      context,
      errorCode,
      ...sanitizeLogMetadata(metadata),
      timestamp: new Date().toISOString(),
    }),
  );
}

const SENSITIVE_LOG_KEY = /(password|hash|otp|code|token|secret|authorization|cookie|phone|accessToken|signedUrl|providerBody)/i;

export function sanitizeLogMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, SENSITIVE_LOG_KEY.test(key) ? "[REDACTED]" : sanitizeLogValue(value)]));
}

function sanitizeLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeLogValue);
  if (value && typeof value === "object") return sanitizeLogMetadata(value as Record<string, unknown>);
  if (typeof value === "string") {
    if (/^\d{4,8}$/.test(value)) return "[REDACTED]";
    return value
      .slice(0, 200)
      .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
      .replace(/\+\d{8,15}\b/g, "[REDACTED]")
      .replace(/(\/(?:order|review)\/)[^/?#\s]+/gi, "$1[REDACTED]")
      .replace(/([?&](?:token|code|signature|order)=)[^&#\s]+/gi, "$1[REDACTED]");
  }
  return value;
}
