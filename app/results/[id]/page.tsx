import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, ChevronDown } from "lucide-react";
import type { ContractAnalysis, FlaggedClause } from "@/lib/types";

const DEMO_ANALYSIS: ContractAnalysis = {
  overallRisk: "HIGH",
  riskScore: 72,
  summary:
    "This is a freelance web development contract with several clauses that significantly favor the client, including broad IP assignment, a restrictive non-compete, and unlimited revision requirements.",
  flaggedClauses: [
    {
      id: "1",
      type: "IP Ownership",
      riskLevel: "HIGH",
      originalText:
        'All work product, including but not limited to code, designs, documentation, and any derivative works, shall be the sole and exclusive property of the Client, including all intellectual property rights therein, in perpetuity and throughout the universe.',
      explanation:
        "This clause transfers ALL intellectual property rights to the client forever — including any tools, libraries, or frameworks you built before this project. It could prevent you from reusing your own code on future projects.",
      suggestion:
        'Negotiate to limit IP transfer to the "deliverables specifically created for this project." Add a carve-out for pre-existing tools and general-purpose code you bring to the project.',
    },
    {
      id: "2",
      type: "Non-Compete",
      riskLevel: "HIGH",
      originalText:
        "Contractor agrees not to provide similar services to any competitor of Client for a period of 24 months following the termination of this Agreement, within a 100-mile radius.",
      explanation:
        "A 2-year non-compete with a 100-mile radius is extremely restrictive for a freelancer. It could effectively prevent you from doing similar work for anyone in your area for two years after this contract ends.",
      suggestion:
        "Push back hard on this. Most courts find broad freelancer non-competes unenforceable, but it is better to negotiate it out. If the client insists, limit it to 3-6 months and narrow it to the client's direct, named competitors only.",
    },
    {
      id: "3",
      type: "Unlimited Revisions",
      riskLevel: "MEDIUM",
      originalText:
        "The Client shall be entitled to request revisions to any deliverable until full satisfaction is achieved, at no additional cost to the Client.",
      explanation:
        'Unlimited revisions with no extra cost means the client can keep requesting changes indefinitely. "Full satisfaction" is subjective and gives you no clear endpoint.',
      suggestion:
        "Specify a set number of revision rounds (e.g., 2-3 rounds) included in the price. Additional revisions should be billed at your hourly rate. Define what constitutes a \"revision\" vs. a \"new feature.\"",
    },
    {
      id: "4",
      type: "Late Payment Terms",
      riskLevel: "MEDIUM",
      originalText:
        "Payment shall be due within 60 days of invoice submission. No interest or penalties shall accrue on late payments.",
      explanation:
        "60-day payment terms are very long for freelance work (30 days is standard). The clause also explicitly removes any penalty for late payment, giving the client no incentive to pay on time.",
      suggestion:
        "Negotiate Net-30 payment terms. Add a late payment fee (1.5% per month is standard). Consider requiring a deposit (25-50%) before starting work.",
    },
    {
      id: "5",
      type: "Termination Clause",
      riskLevel: "LOW",
      originalText:
        "Either party may terminate this Agreement with 14 days written notice. Upon termination, Contractor shall deliver all completed work product.",
      explanation:
        "14 days notice is reasonable. However, this clause doesn't mention payment for work already completed at the time of termination.",
      suggestion:
        'Add language ensuring you are paid for all work completed up to the termination date, plus any non-refundable expenses incurred. Consider a "kill fee" for early termination.',
    },
  ],
};

function getRiskColor(risk: string) {
  switch (risk) {
    case "HIGH":
      return "text-red-600 bg-red-50 border-red-200";
    case "MEDIUM":
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
    case "LOW":
      return "text-green-600 bg-green-50 border-green-200";
    default:
      return "text-gray-600 bg-gray-50 border-gray-200";
  }
}

function getRiskBadgeVariant(risk: string) {
  switch (risk) {
    case "HIGH":
      return "destructive" as const;
    case "MEDIUM":
      return "secondary" as const;
    case "LOW":
      return "outline" as const;
    default:
      return "outline" as const;
  }
}

function getScoreColor(score: number) {
  if (score >= 70) return "bg-red-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-green-500";
}

function ClauseCard({ clause }: { clause: FlaggedClause }) {
  return (
    <Card className={`border ${getRiskColor(clause.riskLevel)}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{clause.type}</CardTitle>
          <Badge variant={getRiskBadgeVariant(clause.riskLevel)}>
            {clause.riskLevel} RISK
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="group">
          <summary className="flex items-center gap-1 text-sm font-medium text-gray-700 cursor-pointer select-none">
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            Original clause text
          </summary>
          <blockquote className="mt-2 pl-4 border-l-2 border-gray-300 text-sm text-gray-600 italic">
            {clause.originalText}
          </blockquote>
        </details>

        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">
            Why this is risky
          </h4>
          <p className="text-sm text-gray-600">{clause.explanation}</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-blue-900 mb-1">
            Suggestion
          </h4>
          <p className="text-sm text-blue-800">{clause.suggestion}</p>
        </div>
      </CardContent>
    </Card>
  );
}

async function getAnalysis(id: string): Promise<ContractAnalysis | null> {
  if (id === "demo") return DEMO_ANALYSIS;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/analysis/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.analysis;
  } catch {
    return null;
  }
}

type Params = Promise<{ id: string }>;

export default async function ResultsPage({ params }: { params: Params }) {
  const { id } = await params;
  const analysis = await getAnalysis(id);

  if (!analysis) {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="border-b bg-white">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <Link href="/" className="text-xl font-bold text-blue-600">
              Contract Redliner
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Analysis Not Found
            </h1>
            <p className="text-gray-600 mb-6">
              This analysis may have expired or the ID is invalid.
            </p>
            <Link href="/analyze" className={cn(buttonVariants())}>
              Analyze a Contract
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const highCount = analysis.flaggedClauses.filter(
    (c) => c.riskLevel === "HIGH"
  ).length;
  const mediumCount = analysis.flaggedClauses.filter(
    (c) => c.riskLevel === "MEDIUM"
  ).length;
  const lowCount = analysis.flaggedClauses.filter(
    (c) => c.riskLevel === "LOW"
  ).length;

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Contract Redliner
          </Link>
          <Link
            href="/analyze"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Analyze Another
          </Link>
        </div>
      </header>

      <main className="flex-1 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Risk Overview */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-2xl">Contract Analysis</CardTitle>
                  <CardDescription className="mt-1">
                    {analysis.summary}
                  </CardDescription>
                </div>
                <Badge
                  variant={getRiskBadgeVariant(analysis.overallRisk)}
                  className="text-lg px-4 py-1"
                >
                  {analysis.overallRisk === "HIGH" && "🔴 "}
                  {analysis.overallRisk === "MEDIUM" && "🟡 "}
                  {analysis.overallRisk === "LOW" && "🟢 "}
                  {analysis.overallRisk} RISK
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Risk Score</span>
                  <span className="font-semibold">
                    {analysis.riskScore}/100
                  </span>
                </div>
                <div className="relative">
                  <Progress
                    value={analysis.riskScore}
                    className="h-3"
                  />
                  <div
                    className={`absolute top-0 left-0 h-3 rounded-full transition-all ${getScoreColor(analysis.riskScore)}`}
                    style={{ width: `${analysis.riskScore}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600">
                  {analysis.flaggedClauses.length} clauses flagged
                  {highCount > 0 && ` · ${highCount} high risk`}
                  {mediumCount > 0 && ` · ${mediumCount} medium risk`}
                  {lowCount > 0 && ` · ${lowCount} low risk`}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Flagged Clauses */}
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Flagged Clauses
          </h2>
          <div className="space-y-4">
            {analysis.flaggedClauses.map((clause) => (
              <ClauseCard key={clause.id} clause={clause} />
            ))}
          </div>

          {/* CTA */}
          <div className="mt-8 text-center">
            <Link
              href="/analyze"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              Analyze Another Contract
            </Link>
          </div>

          <p className="text-xs text-gray-400 text-center mt-6">
            This analysis is for informational purposes only and does not
            constitute legal advice.
          </p>
        </div>
      </main>
    </div>
  );
}
