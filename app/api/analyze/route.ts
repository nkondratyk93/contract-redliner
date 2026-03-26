/**
 * POST /api/analyze
 *
 * Body: { text: string, filename?: string }
 *
 * Response: {
 *   analysisId: string,          // UUID — use to retrieve via GET /api/analysis/:id
 *   analysis: ContractAnalysis,
 *   disclaimer: string,
 *   cached?: boolean
 * }
 *
 * Rate limit: 3 analyses / IP / 24 h (free tier).
 * All responses include a "Not legal advice" disclaimer.
 */

import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";
import { AnalyzeBodySchema, ContractAnalysisSchema } from "@/lib/schemas";
import type { ContractAnalysis } from "@/lib/schemas";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import crypto from "crypto";

export const maxDuration = 60;

const DISCLAIMER =
  "This analysis is for informational purposes only and does not constitute legal advice. " +
  "Always consult a qualified attorney before signing any contract.";

const SYSTEM_PROMPT = `You are a contract review assistant for freelancers and small businesses.
Analyze the contract and identify risky or one-sided clauses.

Return ONLY a raw JSON object — no markdown, no code fences, no commentary — matching this exact structure:
{
  "overallRisk": "HIGH" | "MEDIUM" | "LOW",
  "riskScore": <integer 0-100, higher = riskier>,
  "summary": "<2-3 sentences: what is this contract and who does it favor>",
  "flaggedClauses": [
    {
      "id": "clause-1",
      "type": "<category: IP Ownership | Non-Compete | Unlimited Revisions | Payment Terms | Termination | Liability | Exclusivity | Confidentiality | Indemnification | Governing Law | Other>",
      "riskLevel": "HIGH" | "MEDIUM" | "LOW",
      "originalText": "<exact verbatim text from the contract>",
      "explanation": "<plain English: why is this risky or unfair>",
      "suggestion": "<concrete negotiation language or what to ask for instead>"
    }
  ]
}

Focus on: IP ownership, non-compete, unlimited revisions, late payment, liability caps,
termination clauses, exclusivity, confidentiality overreach, indemnification, auto-renewal.
Return an empty flaggedClauses array if the contract is balanced/low-risk.`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Rate limit ─────────────────────────────────────────────────────────────
  const ip = getClientIp(request);
  const rl = checkRateLimit(ip);

  const rlHeaders = {
    "X-RateLimit-Limit": String(3),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
  };

  if (!rl.allowed) {
    const resetDate = new Date(rl.resetAt).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return NextResponse.json(
      {
        error: `Free tier limit reached (3 analyses per 24 hours). Resets at ${resetDate}.`,
        resetAt: rl.resetAt,
        disclaimer: DISCLAIMER,
      },
      { status: 429, headers: { ...rlHeaders, "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // ── Parse + validate input ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body.", disclaimer: DISCLAIMER },
      { status: 400, headers: rlHeaders }
    );
  }

  const parsed = AnalyzeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input.", disclaimer: DISCLAIMER },
      { status: 400, headers: rlHeaders }
    );
  }

  const { text, filename } = parsed.data;
  const textHash = crypto.createHash("sha256").update(text).digest("hex");

  // ── Dedup: return cached result for identical contract text ────────────────
  try {
    const { data: cached } = await supabase
      .from("contract_redliner_analyses")
      .select("id, analysis_json")
      .eq("text_hash", textHash)
      .limit(1)
      .single();

    if (cached) {
      return NextResponse.json(
        { analysisId: cached.id, analysis: cached.analysis_json, disclaimer: DISCLAIMER, cached: true },
        { headers: rlHeaders }
      );
    }
  } catch {
    // Cache miss — proceed to AI
  }

  // ── AI analysis ────────────────────────────────────────────────────────────
  let rawText: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${SYSTEM_PROMPT}\n\nContract text${filename ? ` (file: ${filename})` : ""}:\n\n${text}`,
        },
      ],
    });
    rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  } catch (err) {
    console.error("[analyze] Anthropic error:", err);
    return NextResponse.json(
      { error: "AI analysis service unavailable. Please try again in a moment.", disclaimer: DISCLAIMER },
      { status: 503, headers: rlHeaders }
    );
  }

  // ── Validate AI response shape ─────────────────────────────────────────────
  let analysis: ContractAnalysis;
  try {
    const aiJson = JSON.parse(rawText);
    const validated = ContractAnalysisSchema.safeParse(aiJson);
    // Use validated data if clean; fall back to raw parse if schema drifts
    analysis = validated.success ? validated.data : (aiJson as ContractAnalysis);
  } catch {
    console.error("[analyze] Failed to parse AI response:", rawText.slice(0, 300));
    return NextResponse.json(
      { error: "Failed to parse AI response. Please try again.", disclaimer: DISCLAIMER },
      { status: 500, headers: rlHeaders }
    );
  }

  // ── Persist to Supabase ────────────────────────────────────────────────────
  let analysisId = crypto.randomUUID();
  try {
    const { data, error } = await supabase
      .from("contract_redliner_analyses")
      .insert({ analysis_json: analysis, text_hash: textHash })
      .select("id")
      .single();
    if (!error && data) analysisId = data.id;
  } catch (err) {
    // Non-fatal: still return the analysis even if DB write fails
    console.error("[analyze] Supabase write error:", err);
  }

  return NextResponse.json(
    { analysisId, analysis, disclaimer: DISCLAIMER },
    { headers: rlHeaders }
  );
}
