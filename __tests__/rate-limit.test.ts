import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabaseServer before any imports
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

// Mock lemonsqueezy so lemonSqueezySetup doesn't throw
vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: vi.fn(),
  createCheckout: vi.fn(),
}));

import { supabaseServer } from "@/lib/supabase-server";

let checkRateLimit: (ip: string) => Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
let getClientIp: (request: Request) => string;

/**
 * Build a mock Supabase chain for the anon_rate_limits table.
 * selectResult: the row returned from .single() (null with error = no row / miss)
 */
function mockRateLimitDb(
  selectResult: { data: { count: number; window_start: string } | null; error: unknown }
) {
  const single = vi.fn().mockResolvedValue(selectResult);
  const eqSelect = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq: eqSelect });

  const eqUpdate = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });

  const upsert = vi.fn().mockResolvedValue({ error: null });

  (supabaseServer.from as ReturnType<typeof vi.fn>).mockReturnValue({
    select,
    update,
    upsert,
  });

  return { single, select, update, upsert, eqUpdate };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  // Re-mock after resetModules
  vi.mock("@/lib/supabase-server", () => ({
    supabaseServer: { from: vi.fn() },
  }));
  vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
    lemonSqueezySetup: vi.fn(),
    createCheckout: vi.fn(),
  }));

  const mod = await import("../lib/rate-limit");
  checkRateLimit = mod.checkRateLimit;
  getClientIp = mod.getClientIp;
});

describe("checkRateLimit", () => {
  it("allows first request from a new IP (no existing record)", async () => {
    const { supabaseServer: sb } = await import("@/lib/supabase-server");

    const single = vi.fn().mockResolvedValue({ data: null, error: "PGRST116" });
    const eqSelect = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (sb.from as ReturnType<typeof vi.fn>).mockReturnValue({ select, upsert });

    const r1 = await checkRateLimit("1.2.3.4");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_hash: expect.any(String), count: 1 }),
      expect.objectContaining({ onConflict: "ip_hash" })
    );
  });

  it("blocks request when count >= FREE_LIMIT (3)", async () => {
    const { supabaseServer: sb } = await import("@/lib/supabase-server");
    const now = Date.now();

    const single = vi.fn().mockResolvedValue({
      data: { count: 3, window_start: new Date(now - 1000).toISOString() },
      error: null,
    });
    const eqSelect = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (sb.from as ReturnType<typeof vi.fn>).mockReturnValue({ select, upsert });

    const r = await checkRateLimit("2.3.4.5");
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("allows request when count < FREE_LIMIT (2) and increments", async () => {
    const { supabaseServer: sb } = await import("@/lib/supabase-server");
    const now = Date.now();

    const single = vi.fn().mockResolvedValue({
      data: { count: 2, window_start: new Date(now - 1000).toISOString() },
      error: null,
    });
    const eqSelect = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });
    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (sb.from as ReturnType<typeof vi.fn>).mockReturnValue({ select, update, upsert });

    const r = await checkRateLimit("3.4.5.6");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(0); // 3 - 3 = 0
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }));
  });

  it("resets window when window_start is older than 24h", async () => {
    const { supabaseServer: sb } = await import("@/lib/supabase-server");
    const now = Date.now();

    const single = vi.fn().mockResolvedValue({
      data: { count: 3, window_start: new Date(now - 25 * 60 * 60 * 1000).toISOString() },
      error: null,
    });
    const eqSelect = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (sb.from as ReturnType<typeof vi.fn>).mockReturnValue({ select, upsert });

    const r = await checkRateLimit("4.5.6.7");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2); // reset to count=1, remaining=2
  });

  it("resetAt is approximately 24h from now for new IP", async () => {
    const { supabaseServer: sb } = await import("@/lib/supabase-server");

    const single = vi.fn().mockResolvedValue({ data: null, error: "PGRST116" });
    const eqSelect = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq: eqSelect });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    (sb.from as ReturnType<typeof vi.fn>).mockReturnValue({ select, upsert });

    const before = Date.now();
    const result = await checkRateLimit("5.6.7.8");
    const after = Date.now();
    const expected24h = 24 * 60 * 60 * 1000;
    expect(result.resetAt).toBeGreaterThanOrEqual(before + expected24h);
    expect(result.resetAt).toBeLessThanOrEqual(after + expected24h + 100);
  });

  it("fails open when Supabase throws (allows request)", async () => {
    const { supabaseServer: sb } = await import("@/lib/supabase-server");
    (sb.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Supabase down");
    });

    const r = await checkRateLimit("6.7.8.9");
    expect(r.allowed).toBe(true);
  });
});

describe("getClientIp", () => {
  it("extracts first IP from x-forwarded-for", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns 'unknown' when header is absent", () => {
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("handles single IP without comma", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "9.8.7.6" },
    });
    expect(getClientIp(req)).toBe("9.8.7.6");
  });
});
