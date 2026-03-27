/**
 * Tier-aware rate limiter.
 *
 * Free (anonymous): 3 analyses / IP / 24 hours (in-memory)
 * Starter ($19/mo): 10 analyses / calendar month (Supabase-backed)
 * Pro ($49/mo):     unlimited
 *
 * Rate limit is ONLY consumed after successful input validation —
 * bad requests never burn a slot.
 */

import type { Plan } from "@/lib/stripe";
import { PLAN_LIMITS } from "@/lib/stripe";

// ── Free tier: in-memory, per-IP ──────────────────────────────────────────────
const FREE_LIMIT = 3;
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface IpEntry {
  count: number;
  windowStart: number;
}
const ipStore = new Map<string, IpEntry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number | null; // null = unlimited
  resetAt: number | null;   // null = unlimited
  plan: Plan;
}

/**
 * Check rate limit for an anonymous (unauthenticated) IP.
 * Mutates the in-memory store — call only after input validation passes.
 */
export function checkAnonRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const entry = ipStore.get(ip);

  if (!entry || now - entry.windowStart > FREE_WINDOW_MS) {
    ipStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: FREE_LIMIT - 1, resetAt: now + FREE_WINDOW_MS, plan: "free" };
  }

  if (entry.count >= FREE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.windowStart + FREE_WINDOW_MS, plan: "free" };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: FREE_LIMIT - entry.count,
    resetAt: entry.windowStart + FREE_WINDOW_MS,
    plan: "free",
  };
}

/**
 * Check rate limit for an authenticated user.
 * Reads/updates Supabase profile — call only after input validation passes.
 */
export async function checkUserRateLimit(
  userId: string,
  plan: Plan,
  // supabaseServer passed in to avoid circular imports
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{ data: Record<string, unknown> | null }>;
      };
      update: (patch: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<void>;
      };
    };
  }
): Promise<RateLimitResult> {
  const limit = PLAN_LIMITS[plan];

  // Pro = unlimited
  if (limit === null) {
    return { allowed: true, remaining: null, resetAt: null, plan };
  }

  // Fetch current usage
  const { data: profile } = await (supabase
    .from("profiles")
    .select("analyses_this_month, analyses_reset_at") as unknown as Promise<{
    data: { analyses_this_month: number; analyses_reset_at: string } | null;
  }>).catch(() => ({ data: null }));

  const now = Date.now();
  const resetAt = profile?.analyses_reset_at
    ? new Date(profile.analyses_reset_at).getTime()
    : now + 30 * 24 * 60 * 60 * 1000;

  // Reset month counter if past reset date
  let used = profile?.analyses_this_month ?? 0;
  if (now >= resetAt) {
    used = 0;
    // Reset will be persisted on the increment below
  }

  if (used >= limit) {
    return { allowed: false, remaining: 0, resetAt, plan };
  }

  // Increment usage
  const newCount = used + 1;
  const newResetAt = now >= resetAt
    ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
    : undefined;

  await (supabase.from("profiles").update({
    analyses_this_month: newCount,
    ...(newResetAt ? { analyses_reset_at: newResetAt } : {}),
    updated_at: new Date().toISOString(),
  }) as unknown as { eq: (col: string, val: string) => Promise<void> }).eq("id", userId);

  return {
    allowed: true,
    remaining: limit - newCount,
    resetAt,
    plan,
  };
}

// ── Backwards compat: original checkRateLimit for anon usage ─────────────────
export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number; plan: Plan } {
  const result = checkAnonRateLimit(ip);
  return {
    allowed: result.allowed,
    remaining: result.remaining ?? 0,
    resetAt: result.resetAt ?? 0,
    plan: "free",
  };
}

export function getClientIp(request: Request): string {
  const fwd = (request.headers as Headers).get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
