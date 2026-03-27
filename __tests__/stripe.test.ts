import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, PLAN_LABELS } from "../lib/lemonsqueezy";
import { calculateRiskScore } from "../lib/risk-scoring";

describe("PLAN_LIMITS", () => {
  it("free tier has limit of 3", () => {
    expect(PLAN_LIMITS.free).toBe(3);
  });

  it("starter tier has limit of 10", () => {
    expect(PLAN_LIMITS.starter).toBe(10);
  });

  it("pro tier is unlimited (null)", () => {
    expect(PLAN_LIMITS.pro).toBeNull();
  });
});

describe("PLAN_LABELS", () => {
  it("all plans have labels", () => {
    expect(PLAN_LABELS.free).toBeTruthy();
    expect(PLAN_LABELS.starter).toContain("19");
    expect(PLAN_LABELS.pro).toContain("49");
  });
});

// Risk scoring integration with plans (business logic)
describe("risk score — pricing page display values", () => {
  it("a HIGH-risk IP clause contract scores ≥70 (shows red badge)", () => {
    const result = calculateRiskScore([{ type: "ip_ownership", risk: "HIGH" }]);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.level).toBe("red");
  });

  it("a fair contract scores <30 (shows green, good for marketing)", () => {
    const result = calculateRiskScore([
      { type: "payment_terms", risk: "LOW" },
      { type: "termination", risk: "LOW" },
    ]);
    expect(result.score).toBe(0);
    expect(result.level).toBe("green");
  });
});
