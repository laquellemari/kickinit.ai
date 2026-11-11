/** Fixed-window, in-memory rate limiter (per server instance). */
export function createLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    /** Returns true if the request is allowed. */
    take(key: string, now = Date.now()): boolean {
      const h = hits.get(key);
      if (!h || now - h.start >= windowMs) {
        hits.set(key, { start: now, count: 1 });
        return true;
      }
      if (h.count >= limit) return false;
      h.count++;
      return true;
    },
  };
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "anonymous";
}
