/**
 * Risk scoring algorithm — matches ARCHITECTURE.md spec exactly.
 *
 * Base scoring: red=25pts, yellow=10pts, green=0pts (capped at 100)
 * Critical clause floors:
 *   - ip_ownership RED → score ≥ 70
 *   - non_compete RED  → score ≥ 60
 *
 * Risk levels: red ≥ 60, yellow ≥ 30, green < 30
 */

export type ClauseType =
  | "ip_ownership"
  | "non_compete"
  | "unlimited_revisions"
  | "liability"
  | "payment_terms"
  | "termination"
  | "other";

export type RiskColor = "red" | "yellow" | "green";

// Architecture also uses HIGH/MEDIUM/LOW — map bidirectionally
export const RISK_TO_COLOR: Record<string, RiskColor> = {
  HIGH: "red",
  MEDIUM: "yellow",
  LOW: "green",
  red: "red",
  yellow: "yellow",
  green: "green",
};

export const COLOR_TO_LEVEL: Record<RiskColor, "HIGH" | "MEDIUM" | "LOW"> = {
  red: "HIGH",
  yellow: "MEDIUM",
  green: "LOW",
};

interface ScoredClause {
  type: string;
  risk: string; // red | yellow | green | HIGH | MEDIUM | LOW
}

export interface RiskScore {
  score: number;        // 0–100
  level: RiskColor;     // red | yellow | green
  levelLabel: "HIGH" | "MEDIUM" | "LOW";
}

const WEIGHTS: Record<RiskColor, number> = { red: 25, yellow: 10, green: 0 };

export function calculateRiskScore(clauses: ScoredClause[]): RiskScore {
  // Normalise incoming risk strings to our color model
  const normalized = clauses.map((c) => ({
    type: c.type,
    color: RISK_TO_COLOR[c.risk] ?? "green",
  }));

  // Base score (capped at 100)
  let score = Math.min(
    normalized.reduce((sum, c) => sum + WEIGHTS[c.color], 0),
    100
  );

  // Critical clause floors (from architecture spec)
  if (normalized.some((c) => c.type === "ip_ownership" && c.color === "red")) {
    score = Math.max(score, 70);
  }
  if (normalized.some((c) => c.type === "non_compete" && c.color === "red")) {
    score = Math.max(score, 60);
  }

  const level: RiskColor = score >= 60 ? "red" : score >= 30 ? "yellow" : "green";

  return { score, level, levelLabel: COLOR_TO_LEVEL[level] };
}

/**
 * Maps AI-returned clause type strings (from the prompt) to canonical types.
 * The AI might return "IP Ownership" or "ip_ownership" — normalise both.
 */
export function normalizeClauseType(raw: string): ClauseType {
  const lower = raw.toLowerCase().replace(/[\s-]/g, "_");
  const map: Record<string, ClauseType> = {
    ip_ownership: "ip_ownership",
    intellectual_property: "ip_ownership",
    ip: "ip_ownership",
    non_compete: "non_compete",
    noncompete: "non_compete",
    non_competition: "non_compete",
    unlimited_revisions: "unlimited_revisions",
    revisions: "unlimited_revisions",
    revision: "unlimited_revisions",
    liability: "liability",
    indemnification: "liability",
    indemnity: "liability",
    payment_terms: "payment_terms",
    payment: "payment_terms",
    late_payment: "payment_terms",
    termination: "termination",
    governing_law: "other",
    confidentiality: "other",
    exclusivity: "other",
  };
  return map[lower] ?? "other";
}
