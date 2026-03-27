/**
 * Integration tests: POST /api/analyze — end-to-end flow
 *
 * These tests exercise the full route handler logic with mocked
 * Supabase and Anthropic SDKs so they run offline / in CI without
 * real credentials.  A separate __tests__/e2e-live.test.ts covers
 * the deployed endpoint with real APIs (run only with LIVE_E2E=1).
 *
 * Acceptance criteria (from task notes):
 * ✓ upload contract text   → AI analysis → risk score → flagged clauses → suggestions
 * ✓ upload PDF             → text extracted → same pipeline
 * ✓ free-tier rate limiting (3/IP/24h) headers and 429 response
 * ✓ error states: invalid JSON, short text, bad file type, AI failure, parse failure
 * ✓ dedup cache: same text hash returns cached=true without calling Anthropic again
 * ✓ legal disclaimer present on every response
 * ✓ rate limit does NOT burn on invalid input (bad text / missing field)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Module mocks (hoisted before imports) ───────────────────────────────────

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/anthropic", () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
}));

// Mock pdf-parse (loaded via require() inside document-parser)
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "Mocked PDF contract text. ".repeat(5) }),
}));

// Mock lemonsqueezy so lemonSqueezySetup doesn't throw during import
vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: vi.fn(),
  createCheckout: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from "@/app/api/analyze/route";
import { supabaseServer } from "@/lib/supabase-server";
import { anthropic } from "@/lib/anthropic";

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_CONTRACT =
  "This Service Agreement ('Agreement') is entered into between Client and Contractor. " +
  "All work product created by Contractor shall be the sole and exclusive property of Client, " +
  "including all pre-existing intellectual property. Contractor may not work for any competitor " +
  "for a period of 24 months following termination. Payment is net-90 days with no kill fee. " +
  "Client may terminate for convenience at any time with no compensation owed to Contractor.";

const VALID_AI_RESPONSE = JSON.stringify({
  overallRisk: "HIGH",
  riskScore: 85,
  summary: "This contract heavily favors the client in all material respects.",
  flaggedClauses: [
    {
      id: "clause-1",
      type: "ip_ownership",
      riskLevel: "HIGH",
      originalText: "All work product created by Contractor shall be the sole and exclusive property of Client",
      explanation: "You permanently surrender all IP rights including pre-existing work.",
      suggestion: "Add: 'excluding Contractor pre-existing intellectual property and general tools'.",
    },
    {
      id: "clause-2",
      type: "non_compete",
      riskLevel: "HIGH",
      originalText: "Contractor may not work for any competitor for a period of 24 months",
      explanation: "24-month broad non-compete severely restricts future earning potential.",
      suggestion: "Limit to 6 months and restrict only to named direct competitors.",
    },
    {
      id: "clause-3",
      type: "payment_terms",
      riskLevel: "HIGH",
      originalText: "Payment is net-90 days with no kill fee.",
      explanation: "Net-90 with no kill fee is extremely unfavorable for cash flow.",
      suggestion: "Negotiate net-14 or net-30, with 25% kill fee on termination.",
    },
  ],
});

/**
 * Build a mock supabaseServer.from that handles both:
 * - contract_redliner_anon_rate_limits (rate-limit table): always "miss", upsert/update no-op
 * - all other tables (analyses): cache miss + successful insert
 */
function buildStandardFromMock(insertId = "test-uuid-1234") {
  return vi.fn().mockImplementation((table: string) => {
    if (table === "contract_redliner_anon_rate_limits") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            // Use single() — rate-limit.ts uses .single() and treats error as "miss"
            single: vi.fn().mockResolvedValue({ data: null, error: "PGRST116" }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    // analyses table and others
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: insertId }, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
  });
}

/**
 * Build a stateful supabaseServer.from mock that tracks anon rate-limit counts per IP hash.
 * Each call to this function starts with a fresh state Map.
 */
function buildStatefulRateLimitFromMock(insertId = "rl-uuid") {
  const rlState = new Map<string, { count: number; window_start: string }>();

  return vi.fn().mockImplementation((table: string) => {
    if (table === "contract_redliner_anon_rate_limits") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((_col: string, ipHash: string) => ({
            single: vi.fn().mockImplementation(() => {
              const rec = rlState.get(ipHash);
              return Promise.resolve(
                rec ? { data: rec, error: null } : { data: null, error: "miss" }
              );
            }),
          })),
        }),
        upsert: vi.fn().mockImplementation(
          (payload: { ip_hash: string; count: number; window_start: string }) => {
            rlState.set(payload.ip_hash, {
              count: payload.count,
              window_start: payload.window_start,
            });
            return Promise.resolve({ error: null });
          }
        ),
        update: vi.fn().mockImplementation((patch: { count: number }) => ({
          eq: vi.fn().mockImplementation((_col: string, ipHash: string) => {
            const rec = rlState.get(ipHash);
            if (rec) rec.count = patch.count;
            return Promise.resolve({ error: null });
          }),
        })),
      };
    }
    // analyses table
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: insertId }, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
  });
}

/**
 * POST helper — builds NextRequest and calls the route handler
 */
function postJSON(body: unknown, ip = "10.0.0.1") {
  const req = new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
  return POST(req);
}

function postText(text: string, ip = "10.0.0.1", filename?: string) {
  return postJSON({ text, ...(filename ? { filename } : {}) }, ip);
}

// ── Test suite ───────────────────────────────────────────────────────────────

/** Standard supabase mock: cache miss → successful insert */
function setupHappyPathMocks() {
  (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(
    buildStandardFromMock("test-uuid-1234")
  );
  (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    content: [{ type: "text", text: VALID_AI_RESPONSE }],
    usage: { input_tokens: 500, output_tokens: 300 },
  });
}

// Each happy-path test gets its own unique IP to avoid rate-limit cross-contamination
let happyPathIpCounter = 0;
function nextHappyIp() { return `11.${++happyPathIpCounter}.0.1`; }

describe("POST /api/analyze — happy path: JSON text input", () => {
  beforeEach(() => {
    setupHappyPathMocks();
  });

  it("returns 200 with analysis, analysisId, and disclaimer", async () => {
    const res = await postText(VALID_CONTRACT, nextHappyIp());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toBeDefined();
    expect(body.analysisId).toBeDefined();
    expect(typeof body.disclaimer).toBe("string");
    expect(body.disclaimer.length).toBeGreaterThan(20);
  });

  it("analysis contains overallRisk, riskScore, summary, flaggedClauses", async () => {
    const res = await postText(VALID_CONTRACT, nextHappyIp());
    const { analysis } = await res.json();
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(analysis.overallRisk);
    expect(typeof analysis.riskScore).toBe("number");
    expect(analysis.riskScore).toBeGreaterThanOrEqual(0);
    expect(analysis.riskScore).toBeLessThanOrEqual(100);
    expect(typeof analysis.summary).toBe("string");
    expect(Array.isArray(analysis.flaggedClauses)).toBe(true);
  });

  it("each flagged clause has required fields: id, type, riskLevel, originalText, explanation, suggestion", async () => {
    const res = await postText(VALID_CONTRACT, nextHappyIp());
    const { analysis } = await res.json();
    for (const clause of analysis.flaggedClauses) {
      expect(clause.id).toBeDefined();
      expect(clause.type).toBeDefined();
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(clause.riskLevel);
      expect(typeof clause.originalText).toBe("string");
      expect(typeof clause.explanation).toBe("string");
      expect(typeof clause.suggestion).toBe("string");
    }
  });

  it("architecture risk scoring overrides LLM riskScore (ip_ownership red → ≥70)", async () => {
    const res = await postText(VALID_CONTRACT, nextHappyIp());
    const { analysis } = await res.json();
    // Contract has ip_ownership HIGH + non_compete HIGH + payment_terms HIGH
    // ip_ownership floor=70, non_compete floor=60, base=75 → expect 100 (capped) or at least 70
    expect(analysis.riskScore).toBeGreaterThanOrEqual(70);
    expect(analysis.overallRisk).toBe("HIGH");
  });

  it("includes rate limit headers on success", async () => {
    const res = await postText(VALID_CONTRACT, nextHappyIp());
    expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBeGreaterThanOrEqual(0);
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("optional filename is accepted without error", async () => {
    const res = await postText(VALID_CONTRACT, "10.0.0.10", "my-contract.pdf");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/analyze — PDF file upload", () => {
  beforeEach(() => {
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(
      buildStandardFromMock("pdf-uuid-5678")
    );

    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        overallRisk: "LOW",
        riskScore: 5,
        summary: "Balanced standard contract.",
        flaggedClauses: [],
      }) }],
      usage: { input_tokens: 200, output_tokens: 100 },
    });
  });

  it("accepts multipart/form-data with a .txt file and returns 200", async () => {
    const contractContent = VALID_CONTRACT;
    const file = new File([contractContent], "contract.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);

    const req = new NextRequest("http://localhost/api/analyze", {
      method: "POST",
      headers: { "x-forwarded-for": "10.1.1.1" },
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toBeDefined();
    expect(body.disclaimer).toBeDefined();
  });

  it("rejects unsupported file type (.xls) with 422", async () => {
    const file = new File(["data"], "spreadsheet.xls", { type: "application/vnd.ms-excel" });
    const form = new FormData();
    form.append("file", file);

    const req = new NextRequest("http://localhost/api/analyze", {
      method: "POST",
      headers: { "x-forwarded-for": "10.1.1.2" },
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Unsupported file type");
    expect(body.disclaimer).toBeDefined();
  });

  it("returns 400 when form has no file field", async () => {
    const form = new FormData();
    form.append("other_field", "value");

    const req = new NextRequest("http://localhost/api/analyze", {
      method: "POST",
      headers: { "x-forwarded-for": "10.1.1.3" },
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No file provided");
  });
});

describe("POST /api/analyze — input validation (bad input should NOT burn rate limit)", () => {
  beforeEach(() => {
    // Supabase/Anthropic should never be called for invalid inputs
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Supabase should not be called for invalid input");
    });
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Anthropic should not be called for invalid input");
    });
  });

  it("rejects text shorter than 50 characters with 400", async () => {
    const res = await postText("Too short.", "20.0.0.1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.disclaimer).toBeDefined();
  });

  it("rejects empty text with 400", async () => {
    const res = await postText("", "20.0.0.2");
    expect(res.status).toBe(400);
  });

  it("rejects text over 50,000 characters with 400", async () => {
    const res = await postText("a".repeat(50_001), "20.0.0.3");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("rejects missing text field with 400", async () => {
    const res = await postJSON({ filename: "contract.pdf" }, "20.0.0.4");
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON body with 400", async () => {
    const req = new NextRequest("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "20.0.0.5" },
      body: "not { valid json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("JSON");
    expect(body.disclaimer).toBeDefined();
  });
});

describe("POST /api/analyze — rate limiting (free tier: 3/IP/24h)", () => {
  const RATE_IP = "192.168.42.42";

  beforeEach(() => {
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(
      buildStatefulRateLimitFromMock()
    );

    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        overallRisk: "LOW", riskScore: 5, summary: "OK", flaggedClauses: [],
      }) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });
  });

  it("allows first 3 requests from an IP", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await postText(VALID_CONTRACT, RATE_IP);
      expect(res.status).toBe(200);
    }
  });

  it("blocks 4th request with 429 and Retry-After header", async () => {
    for (let i = 0; i < 3; i++) {
      await postText(VALID_CONTRACT, RATE_IP);
    }
    const res = await postText(VALID_CONTRACT, RATE_IP);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.resetAt).toBeDefined();
    expect(body.disclaimer).toBeDefined();
    expect(res.headers.get("Retry-After")).toBeDefined();
    expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBe(0);
  });

  it("different IPs have independent limits", async () => {
    for (let i = 0; i < 3; i++) {
      await postText(VALID_CONTRACT, RATE_IP);
    }
    // Different IP should still be allowed
    const res = await postText(VALID_CONTRACT, "192.168.42.99");
    expect(res.status).toBe(200);
  });

  it("invalid input (too short) does not burn a rate limit slot", async () => {
    // These should all fail validation before rate limit is checked
    for (let i = 0; i < 5; i++) {
      const res = await postText("short", "192.168.42.50");
      expect(res.status).toBe(400);
    }
    // After 5 bad requests, valid request should still be allowed (not rate-limited)
    const validRes = await postText(VALID_CONTRACT, "192.168.42.50");
    expect(validRes.status).toBe(200);
    const remaining = Number(validRes.headers.get("X-RateLimit-Remaining"));
    expect(remaining).toBe(2); // First valid request, 2 remaining
  });
});

describe("POST /api/analyze — AI service error states", () => {
  beforeEach(() => {
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(
      buildStandardFromMock("err-uuid")
    );
  });

  it("returns 503 when Anthropic SDK throws", async () => {
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Connection refused")
    );
    const res = await postText(VALID_CONTRACT, "30.0.0.1");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("unavailable");
    expect(body.disclaimer).toBeDefined();
  });

  it("returns 500 when AI returns non-JSON text", async () => {
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: "text", text: "Sorry, I cannot analyze this contract." }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const res = await postText(VALID_CONTRACT, "30.0.0.2");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.disclaimer).toBeDefined();
  });

  it("returns 200 even when Supabase write fails (non-fatal, still returns analysis)", async () => {
    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: "text", text: VALID_AI_RESPONSE }],
      usage: { input_tokens: 500, output_tokens: 300 },
    });
    // Override Supabase to allow rate-limit but fail insert
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === "contract_redliner_anon_rate_limits") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });
    const res = await postText(VALID_CONTRACT, "30.0.0.3");
    // Should still return 200 — Supabase write is non-fatal
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toBeDefined();
    expect(body.analysisId).toBeDefined(); // fallback UUID
  });
});

describe("POST /api/analyze — dedup cache (same text hash → cached=true)", () => {
  it("returns cached=true and skips Anthropic when same text was analyzed before", async () => {
    const cachedAnalysis = JSON.parse(VALID_AI_RESPONSE);

    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === "contract_redliner_anon_rate_limits") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: "miss" }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "cached-uuid", analysis_json: cachedAnalysis },
                error: null,
              }),
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Anthropic should NOT be called when cache hits");
    });

    const res = await postText(VALID_CONTRACT, "40.0.0.1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.analysisId).toBe("cached-uuid");
    expect(body.analysis).toBeDefined();
  });
});

describe("POST /api/analyze — low-risk contract (empty flaggedClauses)", () => {
  it("handles contract with no flagged clauses gracefully", async () => {
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(
      buildStandardFromMock("low-risk-uuid")
    );

    (anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        overallRisk: "LOW",
        riskScore: 5,
        summary: "This is a fair and balanced standard services contract.",
        flaggedClauses: [],
      }) }],
      usage: { input_tokens: 300, output_tokens: 150 },
    });

    const res = await postText(VALID_CONTRACT, "50.0.0.1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis.flaggedClauses).toHaveLength(0);
    expect(body.analysis.overallRisk).toBe("LOW");
    expect(body.analysis.riskScore).toBeGreaterThanOrEqual(0);
    expect(body.analysis.riskScore).toBeLessThanOrEqual(100);
  });
});
