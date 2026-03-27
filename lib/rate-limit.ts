/**
 * Tier-aware rate limiter.
 *
 * Free (anonymous): 3 analyses / IP / 24 hours (Supabase-backed, survives cold starts)
 * Starter ($19/mo): 10 analyses / calendar month (Supabase-backed)
 * Pro ($49/mo):     unlimited
 *
 * Rate limit is ONLY consumed after successful input validation —
 * bad requests never burn a slot.
 */

import type { Plan } from "@/lib/stripe";
import { PLAN_LIMITS } from "@/lib/stripe";

// ── Free tier constants ────────────────────────────────────────────────────────
const FREE_LIMIT = 3;
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RateLimitResult {
  allowed: boolean;
  remaining: number | null; // null = unlimited
  resetAt: number | null;   // null = unlimited
  plan: Plan;
}

/**
 * Hash an IP address with SHA-256 for privacy-safe storage.
 * Uses the Web Crypto API (available in both Edge and Node runtimes).
 */
async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Check rate limit for an anonymous (unauthenticated) IP.
 * Reads/writes the `anon_rate_limits` table via supabaseServer.
 * Fails open on DB error — never blocks users due to infrastructure issues.
 */
export async function checkAnonRateLimit(ip: string): Promise<RateLimitResult> {
  const { supabaseServer } = await import("@/lib/supabase-server");

  let ipHash: string;
  try {
    ipHash = await hashIp(ip);
  } catch {
    // If hashing fails (shouldn't happen), fail open
    console.warn("[rate-limit] IP hashing failed — failing open");
    return { allowed: true, remaining: FREE_LIMIT - 1, resetAt: Date.now() + FREE_WINDOW_MS, plan: "free" };
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  try {
    // Fetch existing row
    const { data: row, error: fetchError } = await (supabaseServer as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { count: number; window_start: string } | null; error: unknown }>;
          };
        };
      };
    })
      .from("anon_rate_limits")
      .select("count, window_start")
      .eq("ip_hash", ipHash)
      .maybeSingle();

    if (fetchError) {
      console.warn("[rate-limit] Supabase fetch error — failing open:", fetchError);
      return { allowed: true, remaining: FREE_LIMIT - 1, resetAt: now + FREE_WINDOW_MS, plan: "free" };
    }

    const windowExpired = !row || now - new Date(row.window_start).getTime() > FREE_WINDOW_MS;

    if (windowExpired) {
      // Upsert: reset window
      const { error: upsertError } = await (supabaseServer as unknown as {
        from: (t: string) => {
          upsert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
        };
      })
        .from("anon_rate_limits")
        .upsert({ ip_hash: ipHash, count: 1, window_start: nowIso, updated_at: nowIso });

      if (upsertError) {
        console.warn("[rate-limit] Supabase upsert error — failing open:", upsertError);
      }
      return { allowed: true, remaining: FREE_LIMIT - 1, resetAt: now + FREE_WINDOW_MS, plan: "free" };
    }

    const resetAt = new Date(row.window_start).getTime() + FREE_WINDOW_MS;

    if (row.count >= FREE_LIMIT) {
      return { allowed: false, remaining: 0, resetAt, plan: "free" };
    }

    // Increment count
    const newCount = row.count + 1;
    const { error: updateError } = await (supabaseServer as unknown as {
      from: (t: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>;
        };
      };
    })
      .from("anon_rate_limits")
      .update({ count: newCount, updated_at: nowIso })
      .eq("ip_hash", ipHash);

    if (updateError) {
      console.warn("[rate-limit] Supabase update error — failing open:", updateError);
    }

    return { allowed: true, remaining: FREE_LIMIT - newCount, resetAt, plan: "free" };
  } catch (err) {
    console.warn("[rate-limit] Unexpected error — failing open:", err);
    return { allowed: true, remaining: FREE_LIMIT - 1, resetAt: now + FREE_WINDOW_MS, plan: "free" };
  }
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
export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; resetAt: number; plan: Plan }> {
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
