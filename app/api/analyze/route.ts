/**
 * POST /api/analyze
 *
 * Accepts:
 *   application/json       → { text: string, filename?: string }
 *   multipart/form-data    → file (PDF/DOCX/TXT, max 10MB)
 *
 * Response:
 * {
 *   analysisId: string,
 *   analysis: {
 *     overallRisk: "HIGH" | "MEDIUM" | "LOW",
 *     riskScore: 0-100,
 *     summary: string,
 *     flaggedClauses: [{ id, type, riskLevel, originalText, explanation, suggestion }]
 *   },
 *   disclaimer: string,
 *   cached?: boolean
 * }
 *
 * Rate limit: 3 analyses / IP / 24 h (free tier MVP).
 * Validated BEFORE rate limit check — bad input never burns a slot.
 * All responses include a legal disclaimer.
 */

import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase-server";
import { AnalyzeBodySchema, ContractAnalysisSchema } from "@/lib/schemas";
import type { ContractAnalysis } from "@/lib/schemas";
import { checkRateLimit, checkUserRateLimit, getClientIp, FREE_LIMIT } from "@/lib/rate-limit";
import type { Plan } from "@/lib/lemonsqueezy";
import { PLAN_LIMITS } from "@/lib/lemonsqueezy";
import { extractText, detectFileType } from "@/lib/document-parser";
import { calculateRiskScore, normalizeClauseType } from "@/lib/risk-scoring";
import crypto from "crypto";

export const maxDuration = 60;

const DISCLAIMER =
  "This analysis is for informational purposes only and does not constitute legal advice. " +
  "Always consult a qualified attorney before signing any contract.";

// System prompt aligned with ARCHITECTURE.md clause detection matrix
const SYSTEM_PROMPT = `You are a contract review assistant for freelancers and small businesses.
Analyze the provided contract and identify risky or one-sided clauses.

Return ONLY a raw JSON object — no markdown, no code fences, no commentary:
{
  "overallRisk": "HIGH" | "MEDIUM" | "LOW",
  "riskScore": <integer 0-100, higher = riskier>,
  "summary": "<2-3 sentences: what is this contract and who does it favor>",
  "flaggedClauses": [
    {
      "id": "clause-1",
      "type": "<ip_ownership | non_compete | unlimited_revisions | liability | payment_terms | termination | other>",
      "riskLevel": "HIGH" | "MEDIUM" | "LOW",
      "originalText": "<exact verbatim text from the contract>",
      "explanation": "<plain English: why is this risky or unfair to the contractor/freelancer>",
      "suggestion": "<concrete negotiation language or proposed alternative wording>"
    }
  ]
}

Clause detection guidance:
- ip_ownership HIGH: "sole property of client", all IP transfers, includes pre-existing work
- ip_ownership MEDIUM: joint ownership, IP transfers only upon payment
- non_compete HIGH: duration >12 months, broad scope (industry-wide)
- non_compete MEDIUM: duration <12 months, narrow named-competitor scope
- unlimited_revisions HIGH: no revision cap, no time limit, "until satisfaction"
- unlimited_revisions MEDIUM: vague revision language without clear limits
- liability HIGH: unlimited contractor liability, broad indemnification, consequential damages
- payment_terms HIGH: net 60+ days, no kill fee, no late payment interest
- payment_terms MEDIUM: net 30-45, kill fee below 25%, vague payment milestones
- termination HIGH: client can terminate for convenience with no compensation
- termination MEDIUM: short notice (<14 days), partial payment on termination

Return empty flaggedClauses array if the contract is balanced and low-risk.`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const contentType = request.headers.get("content-type") ?? "";

  // ── 1. Parse input ─────────────────────────────────────────────────────────
  let contractText: string;
  let filename: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form data.", disclaimer: DISCLAIMER },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Include a 'file' field.", disclaimer: DISCLAIMER },
        { status: 400 }
      );
    }

    filename = file.name;
    const fileType = detectFileType(file.name, file.type);

    if (!fileType) {
      return NextResponse.json(
        {
          error: "Unsupported file type. Please upload a PDF, DOCX, or TXT file.",
          disclaimer: DISCLAIMER,
        },
        { status: 422 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      contractText = await extractText(buffer, fileType, file.name);
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Failed to extract text from file.",
          disclaimer: DISCLAIMER,
        },
        { status: 422 }
      );
    }
  } else {
    // JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body.", disclaimer: DISCLAIMER },
        { status: 400 }
      );
    }

    // ── 2. Validate BEFORE consuming rate limit slot ────────────────────────
    const parsed = AnalyzeBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid input.",
          disclaimer: DISCLAIMER,
        },
        { status: 400 }
      );
    }

    contractText = parsed.data.text;
    filename = parsed.data.filename;
  }

  if (contractText.trim().length < 50) {
    return NextResponse.json(
      { error: "Contract text too short. Provide at least 50 characters.", disclaimer: DISCLAIMER },
      { status: 400 }
    );
  }

  // ── 3. Rate limit — tier-aware, only after validation ─────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const userToken = authHeader.replace("Bearer ", "").trim();

  let rl: { allowed: boolean; remaining: number | null; resetAt: number | null; plan: Plan };

  if (userToken) {
    // Authenticated: check Supabase plan-based limits
    const { data: { user } } = await supabaseServer.auth.getUser(userToken).catch(() => ({ data: { user: null } }));
    if (user) {
      let profileData: { plan?: string } | null = null;
      try {
        const { data } = await supabaseServer
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .single();
        profileData = data as { plan?: string } | null;
      } catch { /* default to free */ }

      const plan = (profileData?.plan ?? "free") as Plan;
      rl = await checkUserRateLimit(user.id, plan, supabaseServer as unknown as Parameters<typeof checkUserRateLimit>[2]);
    } else {
      rl = await checkRateLimit(ip);
    }
  } else {
    // Anonymous: Supabase-backed IP-based limit
    rl = await checkRateLimit(ip);
  }

  const rlHeaders: Record<string, string> = {
    "X-RateLimit-Limit": rl.remaining === null ? "unlimited" : String(PLAN_LIMITS[rl.plan] ?? FREE_LIMIT),
    ...(rl.remaining !== null && { "X-RateLimit-Remaining": String(rl.remaining) }),
    ...(rl.resetAt !== null && { "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)) }),
  };

  if (!rl.allowed) {
    const resetMsg = rl.resetAt
      ? `Your limit resets at ${new Date(rl.resetAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.`
      : "";
    const limitMsg = rl.plan === "starter"
      ? `Starter plan limit reached (10 analyses per month). ${resetMsg}`
      : `Free tier limit reached (3 analyses per 24 hours). ${resetMsg}`;
    return NextResponse.json(
      { error: limitMsg, resetAt: rl.resetAt, plan: rl.plan, disclaimer: DISCLAIMER },
      {
        status: 429,
        headers: {
          ...rlHeaders,
          ...(rl.resetAt && { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) }),
        },
      }
    );
  }

  const textHash = crypto.createHash("sha256").update(contractText.trim()).digest("hex");

  // ── 4. Dedup cache ─────────────────────────────────────────────────────────
  try {
    const { data: cached } = await supabaseServer
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
    // Cache miss — proceed
  }

  // ── 5. AI analysis ─────────────────────────────────────────────────────────
  const startMs = Date.now();
  let rawText: string;
  let tokensUsed: number | undefined;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${SYSTEM_PROMPT}\n\nContract text${filename ? ` (file: ${filename})` : ""}:\n\n${contractText}`,
        },
      ],
    });
    rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    tokensUsed = message.usage?.input_tokens + message.usage?.output_tokens;
  } catch (err: unknown) {
    console.error("[analyze] Anthropic error:", (err as Error).message);
    return NextResponse.json(
      { error: "AI analysis service unavailable. Please try again in a moment.", disclaimer: DISCLAIMER },
      { status: 503, headers: rlHeaders }
    );
  }

  const processingMs = Date.now() - startMs;

  // ── 6. Parse + apply architecture risk scoring algorithm ───────────────────
  let analysis: ContractAnalysis;
  try {
    // Strip markdown code fences if the model wraps JSON in ```json ... ```
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const aiJson = JSON.parse(cleanText);
    const validated = ContractAnalysisSchema.safeParse(aiJson);
    const base = validated.success ? validated.data : (aiJson as ContractAnalysis);

    // Re-compute risk score using the architecture's weighted algorithm
    // (overrides whatever the LLM returned for consistency)
    if (base.flaggedClauses?.length > 0) {
      const scored = calculateRiskScore(
        base.flaggedClauses.map((c) => ({
          type: normalizeClauseType(c.type),
          risk: c.riskLevel,
        }))
      );
      analysis = {
        ...base,
        riskScore: scored.score,
        overallRisk: scored.levelLabel,
      };
    } else {
      analysis = base;
    }
  } catch {
    console.error("[analyze] Failed to parse AI JSON:", rawText.slice(0, 300));
    return NextResponse.json(
      { error: "Failed to parse AI response. Please try again.", disclaimer: DISCLAIMER },
      { status: 500, headers: rlHeaders }
    );
  }

  // ── 7. Persist to Supabase ─────────────────────────────────────────────────
  let analysisId = crypto.randomUUID();
  try {
    const { data, error } = await supabaseServer
      .from("contract_redliner_analyses")
      .insert({
        analysis_json: analysis,
        text_hash: textHash,
      })
      .select("id")
      .single();

    if (!error && data) analysisId = data.id;
  } catch (err) {
    console.error("[analyze] Supabase write error:", err);
    // Non-fatal
  }

  // Log model/token usage for cost tracking (best-effort)
  if (tokensUsed) {
    console.log(`[analyze] tokens=${tokensUsed} ms=${processingMs} id=${analysisId}`);
  }

  return NextResponse.json(
    { analysisId, analysis, disclaimer: DISCLAIMER },
    { headers: rlHeaders }
  );
}
