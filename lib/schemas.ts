/**
 * Zod schemas — validated on every request, no trust in inputs.
 * Aligned with ARCHITECTURE.md API spec.
 */
import { z } from "zod";

// ─── POST /api/analyze ────────────────────────────────────────────────────────

export const AnalyzeBodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(50, "Contract text must be at least 50 characters.")
    .max(50_000, "Contract text is too long (max 50,000 characters)."),
  filename: z.string().max(255).optional(),
});

export type AnalyzeBodyInput = z.infer<typeof AnalyzeBodySchema>;

// ─── AI response shape — what Claude returns ─────────────────────────────────

const RiskLevelSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const FlaggedClauseSchema = z.object({
  id: z.string(),
  type: z.string(),
  riskLevel: RiskLevelSchema,
  originalText: z.string(),
  explanation: z.string(),
  suggestion: z.string(),
});

export const ContractAnalysisSchema = z.object({
  overallRisk: RiskLevelSchema,
  riskScore: z.number().int().min(0).max(100),
  summary: z.string(),
  flaggedClauses: z.array(FlaggedClauseSchema),
});

export type FlaggedClause = z.infer<typeof FlaggedClauseSchema>;
export type ContractAnalysis = z.infer<typeof ContractAnalysisSchema>;
