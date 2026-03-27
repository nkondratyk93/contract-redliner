/**
 * Tier-aware rate limiter.
 *
 * Free (anonymous): 3 analyses / IP / 24 hours — Supabase-backed (survives cold starts)
 * Starter ($19/mo): 10 analyses / calendar month (Supabase-backed)
 * Pro ($49/mo):     unlimited
 *
 * IPs are hashed with SHA-256 before storage (privacy by design — raw IPs never stored).
 * Rate limit is ONLY consumed after successful input validation —
 * bad requests never burn a slot.
 */

import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import type { Plan } from "@/lib/lemonsqueezy";
import { PLAN_LIMITS } from "@/lib/lemonsqueezy";

export const FREE_LIMIT = 3;
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RateLimitResult {
  allowed: boolean;
  remaining: number | null; // null = unlimited
  resetAt: number | null;   // null = unlimited
  plan: Plan;
}

function hashIp(ip: string): string {
  // Salt prevents rainbow-table lookup of known IPs
  return crypto
    .createHash("sha256")
    .update(ip + (process.env.IP_HASH_SALT ?? ""))
    .digest("hex");
}

/**
 * Check + consume rate limit for an anonymous (unauthenticated) IP.
 * Supabase-backed: survives Vercel cold starts.
 * Call only after input validation passes.
 */
export async function checkAnonRateLimit(ip: string): Promise<RateLimitResult> {
  const ipHash = hashIp(ip);
  const now = Date.now();

  try {
    // Fetch existing record for this IP hash
    // Use .single() — if no row exists, Supabase returns an error which we treat as a miss
    const { data: existing, error: fetchError } = await supabaseServer
      .from("contract_redliner_anon_rate_limits")
      .select("count, window_start")
      .eq("ip_hash", ipHash)
      .single();

    const windowExpired =
      fetchError ||
      !existing ||
      new Date(existing.window_start as string).getTime() < now - FREE_WINDOW_MS;

    if (windowExpired) {
      // No record or window expired — create/reset with count=1
      await supabaseServer
        .from("contract_redliner_anon_rate_limits")
        .upsert(
          {
            ip_hash: ipHash,
            count: 1,
            window_start: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
          { onConflict: "ip_hash" }
        );

      return {
        allowed: true,
        remaining: FREE_LIMIT - 1,
        resetAt: now + FREE_WINDOW_MS,
        plan: "free",
      };
    }

    const windowStart = new Date(existing.window_start as string).getTime();
    const resetAt = windowStart + FREE_WINDOW_MS;
    const count = existing.count as number;

    if (count >= FREE_LIMIT) {
      return { allowed: false, remaining: 0, resetAt, plan: "free" };
    }

    // Increment usage
    const newCount = count + 1;
    await supabaseServer
      .from("contract_redliner_anon_rate_limits")
      .update({ count: newCount, updated_at: new Date(now).toISOString() })
      .eq("ip_hash", ipHash);

    return {
      allowed: true,
      remaining: FREE_LIMIT - newCount,
      resetAt,
      plan: "free",
    };
  } catch (err) {
    // Fail open: if Supabase is down, allow the request
    // (better UX than blocking everyone during a DB outage)
    console.error("[rate-limit] Supabase error — failing open:", (err as Error).message);
    return { allowed: true, remaining: 0, resetAt: now + FREE_WINDOW_MS, plan: "free" };
  }
}

/**
 * Check rate limit for an authenticated user (Starter plan: monthly quota).
 */
export async function checkUserRateLimit(
  userId: string,
  plan: Plan,
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

  const { data: profile } = await (
    supabase
      .from("profiles")
      .select("analyses_this_month, analyses_reset_at") as unknown as Promise<{
      data: { analyses_this_month: number; analyses_reset_at: string } | null;
    }>
  ).catch(() => ({ data: null }));

  const now = Date.now();
  const resetAt = profile?.analyses_reset_at
    ? new Date(profile.analyses_reset_at).getTime()
    : now + 30 * 24 * 60 * 60 * 1000;

  let used = profile?.analyses_this_month ?? 0;
  if (now >= resetAt) {
    used = 0;
  }

  if (used >= limit) {
    return { allowed: false, remaining: 0, resetAt, plan };
  }

  const newCount = used + 1;
  const newResetAt =
    now >= resetAt
      ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
      : undefined;

  await (
    supabase.from("profiles").update({
      analyses_this_month: newCount,
      ...(newResetAt ? { analyses_reset_at: newResetAt } : {}),
      updated_at: new Date().toISOString(),
    }) as unknown as { eq: (col: string, val: string) => Promise<void> }
  ).eq("id", userId);

  return {
    allowed: true,
    remaining: limit - newCount,
    resetAt,
    plan,
  };
}

/**
 * Backwards-compat async wrapper — delegates to checkAnonRateLimit.
 */
export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  plan: Plan;
}> {
  const result = await checkAnonRateLimit(ip);
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
