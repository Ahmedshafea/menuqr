type Entry = { count: number; resetAt: number };

const globalStore = globalThis as typeof globalThis & {
  __menuqrRateLimits?: Map<string, Entry>;
};
const store = globalStore.__menuqrRateLimits ?? new Map<string, Entry>();
if (process.env.NODE_ENV !== "production")
  globalStore.__menuqrRateLimits = store;

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (store.size > 5000)
    for (const [entryKey, entry] of store)
      if (entry.resetAt <= now) store.delete(entryKey);
  while (store.size > 10_000)
    store.delete(store.keys().next().value as string);
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    retryAfter: Math.ceil((current.resetAt - now) / 1000),
  };
}

export function requestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
