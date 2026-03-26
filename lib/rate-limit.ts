/**
 * Simple in-memory rate limiter.
 * Free tier: 3 analyses per IP per 24 hours.
 * Resets on each Vercel cold start — acceptable for MVP.
 */

const FREE_LIMIT = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface Entry {
  count: number;
  windowStart: number;
}

const store = new Map<string, Entry>();

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: FREE_LIMIT - 1, resetAt: now + WINDOW_MS };
  }

  if (entry.count >= FREE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.windowStart + WINDOW_MS };
  }

  entry.count++;
  return { allowed: true, remaining: FREE_LIMIT - entry.count, resetAt: entry.windowStart + WINDOW_MS };
}

export function getClientIp(request: Request): string {
  const fwd = (request.headers as Headers).get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
