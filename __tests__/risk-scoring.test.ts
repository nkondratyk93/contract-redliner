import { describe, it, expect } from "vitest";
import { calculateRiskScore, normalizeClauseType } from "../lib/risk-scoring";

describe("calculateRiskScore", () => {
  it("returns score=0 and green for empty clauses", () => {
    const result = calculateRiskScore([]);
    expect(result.score).toBe(0);
    expect(result.level).toBe("green");
    expect(result.levelLabel).toBe("LOW");
  });

  it("weights red=25, yellow=10, green=0", () => {
    const result = calculateRiskScore([
      { type: "payment_terms", risk: "red" },    // +25
      { type: "termination", risk: "yellow" },   // +10
      { type: "liability", risk: "green" },      // +0
    ]);
    expect(result.score).toBe(35);
    expect(result.level).toBe("yellow");
    expect(result.levelLabel).toBe("MEDIUM");
  });

  it("caps score at 100", () => {
    // 5 red clauses = 125pts → capped at 100
    const result = calculateRiskScore([
      { type: "payment_terms", risk: "red" },
      { type: "termination", risk: "red" },
      { type: "liability", risk: "red" },
      { type: "unlimited_revisions", risk: "red" },
      { type: "other", risk: "red" },
    ]);
    expect(result.score).toBe(100);
    expect(result.level).toBe("red");
  });

  it("applies ip_ownership RED floor: score >= 70", () => {
    // Only 1 red clause = 25pts normally, but ip_ownership floor = 70
    const result = calculateRiskScore([
      { type: "ip_ownership", risk: "red" },
    ]);
    expect(result.score).toBe(70);
    expect(result.level).toBe("red");
  });

  it("applies non_compete RED floor: score >= 60", () => {
    const result = calculateRiskScore([
      { type: "non_compete", risk: "red" },
    ]);
    expect(result.score).toBe(60);
    expect(result.level).toBe("red");
  });

  it("ip_ownership floor does not lower an already-higher score", () => {
    // 4 red non-ip clauses = 100pts, ip_ownership floor = 70 → stays 100
    const result = calculateRiskScore([
      { type: "ip_ownership", risk: "red" },
      { type: "termination", risk: "red" },
      { type: "liability", risk: "red" },
      { type: "payment_terms", risk: "red" },
    ]);
    expect(result.score).toBe(100);
  });

  it("accepts HIGH/MEDIUM/LOW as risk values (aliases)", () => {
    const result = calculateRiskScore([
      { type: "ip_ownership", risk: "HIGH" },
      { type: "termination", risk: "MEDIUM" },
      { type: "liability", risk: "LOW" },
    ]);
    // ip_ownership HIGH (=red) → floor 70, plus yellow+green don't lower it
    expect(result.score).toBe(70);
    expect(result.level).toBe("red");
  });

  it("risk level boundaries: red>=60, yellow>=30, green<30", () => {
    expect(calculateRiskScore([{ type: "other", risk: "red" }, { type: "other", risk: "red" }]).level)
      .toBe("yellow"); // 50 → yellow

    expect(calculateRiskScore(
      Array(3).fill({ type: "other", risk: "red" })
    ).level).toBe("red"); // 75 → red

    expect(calculateRiskScore([{ type: "other", risk: "yellow" }]).level)
      .toBe("green"); // 10 → green

    expect(calculateRiskScore([
      { type: "other", risk: "yellow" },
      { type: "other", risk: "yellow" },
      { type: "other", risk: "yellow" },
    ]).level).toBe("yellow"); // 30 → yellow
  });
});

describe("normalizeClauseType", () => {
  it("handles exact canonical names", () => {
    expect(normalizeClauseType("ip_ownership")).toBe("ip_ownership");
    expect(normalizeClauseType("non_compete")).toBe("non_compete");
    expect(normalizeClauseType("unlimited_revisions")).toBe("unlimited_revisions");
    expect(normalizeClauseType("liability")).toBe("liability");
    expect(normalizeClauseType("payment_terms")).toBe("payment_terms");
    expect(normalizeClauseType("termination")).toBe("termination");
  });

  it("normalises human-readable LLM output", () => {
    expect(normalizeClauseType("IP Ownership")).toBe("ip_ownership");
    expect(normalizeClauseType("Non-Compete")).toBe("non_compete");
    expect(normalizeClauseType("Unlimited Revisions")).toBe("unlimited_revisions");
    expect(normalizeClauseType("Indemnification")).toBe("liability");
    expect(normalizeClauseType("Payment Terms")).toBe("payment_terms");
    expect(normalizeClauseType("Intellectual Property")).toBe("ip_ownership");
  });

  it("falls back to 'other' for unknown types", () => {
    expect(normalizeClauseType("Arbitration Clause")).toBe("other");
    expect(normalizeClauseType("Force Majeure")).toBe("other");
    expect(normalizeClauseType("Governing Law")).toBe("other");
    expect(normalizeClauseType("Confidentiality")).toBe("other");
  });
});
