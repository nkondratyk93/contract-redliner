import { describe, it, expect } from "vitest";
import { AnalyzeBodySchema, ContractAnalysisSchema } from "../lib/schemas";

describe("AnalyzeBodySchema", () => {
  it("accepts valid text", () => {
    const result = AnalyzeBodySchema.safeParse({
      text: "This is a valid contract text that is definitely longer than fifty characters.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts text with optional filename", () => {
    const result = AnalyzeBodySchema.safeParse({
      text: "This is a valid contract text that is definitely longer than fifty characters.",
      filename: "contract.pdf",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.filename).toBe("contract.pdf");
  });

  it("rejects text shorter than 50 characters", () => {
    const result = AnalyzeBodySchema.safeParse({ text: "Too short." });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50 characters");
    }
  });

  it("rejects empty string", () => {
    const result = AnalyzeBodySchema.safeParse({ text: "" });
    expect(result.success).toBe(false);
  });

  it("rejects text over 50,000 characters", () => {
    const result = AnalyzeBodySchema.safeParse({ text: "a".repeat(50_001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50,000");
    }
  });

  it("trims whitespace before length check", () => {
    // "   " + 50 chars of text = passes after trim
    const result = AnalyzeBodySchema.safeParse({
      text: "   " + "x".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing text field", () => {
    const result = AnalyzeBodySchema.safeParse({ filename: "contract.pdf" });
    expect(result.success).toBe(false);
  });
});

describe("ContractAnalysisSchema", () => {
  const validAnalysis = {
    overallRisk: "HIGH",
    riskScore: 75,
    summary: "This contract heavily favors the client.",
    flaggedClauses: [
      {
        id: "clause-1",
        type: "ip_ownership",
        riskLevel: "HIGH",
        originalText: "All work product shall be the sole property of Client.",
        explanation: "You lose all IP rights.",
        suggestion: "Limit IP transfer to project deliverables only.",
      },
    ],
  };

  it("accepts valid analysis", () => {
    const result = ContractAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
  });

  it("accepts empty flaggedClauses (low-risk contract)", () => {
    const result = ContractAnalysisSchema.safeParse({
      ...validAnalysis,
      overallRisk: "LOW",
      riskScore: 5,
      flaggedClauses: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid overallRisk", () => {
    const result = ContractAnalysisSchema.safeParse({
      ...validAnalysis,
      overallRisk: "CRITICAL",
    });
    expect(result.success).toBe(false);
  });

  it("rejects riskScore out of 0-100 range", () => {
    expect(ContractAnalysisSchema.safeParse({ ...validAnalysis, riskScore: -1 }).success).toBe(false);
    expect(ContractAnalysisSchema.safeParse({ ...validAnalysis, riskScore: 101 }).success).toBe(false);
    expect(ContractAnalysisSchema.safeParse({ ...validAnalysis, riskScore: 0 }).success).toBe(true);
    expect(ContractAnalysisSchema.safeParse({ ...validAnalysis, riskScore: 100 }).success).toBe(true);
  });

  it("rejects invalid clause riskLevel", () => {
    const result = ContractAnalysisSchema.safeParse({
      ...validAnalysis,
      flaggedClauses: [{ ...validAnalysis.flaggedClauses[0], riskLevel: "CRITICAL" }],
    });
    expect(result.success).toBe(false);
  });
});
