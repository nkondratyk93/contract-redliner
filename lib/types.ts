export interface FlaggedClause {
  id: string;
  type: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  originalText: string;
  explanation: string;
  suggestion: string;
}

export interface ContractAnalysis {
  overallRisk: "HIGH" | "MEDIUM" | "LOW";
  riskScore: number;
  summary: string;
  flaggedClauses: FlaggedClause[];
}

export interface AnalysisResponse {
  analysisId: string;
  analysis: ContractAnalysis;
}
