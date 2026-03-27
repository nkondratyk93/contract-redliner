/**
 * Unit tests: GET /api/analysis/:id
 *
 * Tests the analysis retrieval endpoint — UUID validation,
 * cache hit, not-found, and error states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

import { GET } from "@/app/api/analysis/[id]/route";
import { supabaseServer } from "@/lib/supabase-server";

const SAMPLE_ANALYSIS = {
  overallRisk: "HIGH",
  riskScore: 75,
  summary: "This contract heavily favors the client.",
  flaggedClauses: [
    {
      id: "clause-1",
      type: "ip_ownership",
      riskLevel: "HIGH",
      originalText: "All IP belongs to Client.",
      explanation: "You lose all rights.",
      suggestion: "Limit to deliverables only.",
    },
  ],
};

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeRequest(id: string) {
  const request = new Request(`http://localhost/api/analysis/${id}`);
  const params: Promise<{ id: string }> = Promise.resolve({ id });
  return GET(request, { params });
}

describe("GET /api/analysis/:id — happy path", () => {
  beforeEach(() => {
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: VALID_UUID,
              analysis_json: SAMPLE_ANALYSIS,
              text_hash: "abc123",
              created_at: "2026-03-27T00:00:00Z",
            },
            error: null,
          }),
        }),
      }),
    }));
  });

  it("returns 200 with analysis data", async () => {
    const res = await makeRequest(VALID_UUID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(VALID_UUID);
    expect(body.analysis).toBeDefined();
    expect(body.analysis_json).toBeDefined();
    expect(body.disclaimer).toBeDefined();
  });

  it("returns analysis alias that matches analysis_json (frontend compatibility)", async () => {
    const res = await makeRequest(VALID_UUID);
    const body = await res.json();
    expect(body.analysis).toEqual(body.analysis_json);
  });

  it("includes created_at and text_hash fields", async () => {
    const res = await makeRequest(VALID_UUID);
    const body = await res.json();
    expect(body.created_at).toBeDefined();
    expect(body.text_hash).toBeDefined();
  });

  it("analysis has required fields: overallRisk, riskScore, summary, flaggedClauses", async () => {
    const res = await makeRequest(VALID_UUID);
    const { analysis } = await res.json();
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(analysis.overallRisk);
    expect(typeof analysis.riskScore).toBe("number");
    expect(typeof analysis.summary).toBe("string");
    expect(Array.isArray(analysis.flaggedClauses)).toBe(true);
  });
});

describe("GET /api/analysis/:id — validation and not-found", () => {
  it("returns 400 for non-UUID id", async () => {
    const res = await makeRequest("not-a-uuid");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid analysis ID");
    expect(body.disclaimer).toBeDefined();
  });

  it("returns 400 for empty id", async () => {
    const res = await makeRequest("");
    expect(res.status).toBe(400);
  });

  it("returns 404 when analysis not found in DB", async () => {
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
        }),
      }),
    }));
    const res = await makeRequest(VALID_UUID);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
    expect(body.disclaimer).toBeDefined();
  });

  it("returns 500 on unexpected DB error", async () => {
    (supabaseServer.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockRejectedValue(new Error("Connection pool exhausted")),
        }),
      }),
    }));
    const res = await makeRequest(VALID_UUID);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.disclaimer).toBeDefined();
  });
});
