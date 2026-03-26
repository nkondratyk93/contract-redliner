import { describe, it, expect, beforeEach, vi } from "vitest";

// Isolate the module between tests so the Map store resets
let checkRateLimit: (ip: string) => { allowed: boolean; remaining: number; resetAt: number };
let getClientIp: (request: Request) => string;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../lib/rate-limit");
  checkRateLimit = mod.checkRateLimit;
  getClientIp = mod.getClientIp;
});

describe("checkRateLimit", () => {
  it("allows first 3 requests from a new IP", () => {
    const r1 = checkRateLimit("1.2.3.4");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit("1.2.3.4");
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit("1.2.3.4");
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks 4th request from same IP", () => {
    checkRateLimit("2.3.4.5");
    checkRateLimit("2.3.4.5");
    checkRateLimit("2.3.4.5");
    const r4 = checkRateLimit("2.3.4.5");
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("different IPs have independent rate limit windows", () => {
    checkRateLimit("10.0.0.1");
    checkRateLimit("10.0.0.1");
    checkRateLimit("10.0.0.1");
    // 10.0.0.1 is blocked

    const r = checkRateLimit("10.0.0.2");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it("resets window after 24h", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    checkRateLimit("3.4.5.6");
    checkRateLimit("3.4.5.6");
    checkRateLimit("3.4.5.6");
    expect(checkRateLimit("3.4.5.6").allowed).toBe(false);

    // Advance 25 hours
    vi.setSystemTime(now + 25 * 60 * 60 * 1000);
    const after = checkRateLimit("3.4.5.6");
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(2);

    vi.useRealTimers();
  });

  it("resetAt is approximately 24h from window start", () => {
    const before = Date.now();
    const result = checkRateLimit("4.5.6.7");
    const after = Date.now();
    const expected24h = 24 * 60 * 60 * 1000;
    expect(result.resetAt).toBeGreaterThanOrEqual(before + expected24h);
    expect(result.resetAt).toBeLessThanOrEqual(after + expected24h + 100);
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
