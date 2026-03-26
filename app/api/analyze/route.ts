import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";
import type { ContractAnalysis } from "@/lib/types";
import crypto from "crypto";

const SYSTEM_PROMPT = `You are a contract review assistant for freelancers. Analyze the following contract and identify risky clauses.

Return a JSON response with this exact structure:
{
  "overallRisk": "HIGH" | "MEDIUM" | "LOW",
  "riskScore": 0-100,
  "summary": "brief summary of what this contract is about",
  "flaggedClauses": [
    {
      "id": "unique-id",
      "type": "clause type name",
      "riskLevel": "HIGH" | "MEDIUM" | "LOW",
      "originalText": "the relevant clause text",
      "explanation": "plain english explanation of why this is risky",
      "suggestion": "what to ask for instead or how to negotiate"
    }
  ]
}

Focus on: IP ownership, non-compete clauses, unlimited revisions, late payment terms, liability, termination clauses, exclusivity, confidentiality overreach.

Return ONLY valid JSON, no markdown code fences or extra text.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, filename } = body as { text: string; filename?: string };

    if (!text || typeof text !== "string" || text.trim().length < 50) {
      return NextResponse.json(
        { error: "Please provide at least 50 characters of contract text." },
        { status: 400 }
      );
    }

    const textHash = crypto
      .createHash("sha256")
      .update(text.trim())
      .digest("hex");

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${SYSTEM_PROMPT}\n\nContract text${filename ? ` (from file: ${filename})` : ""}:\n${text}`,
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let analysis: ContractAnalysis;
    try {
      analysis = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response. Please try again." },
        { status: 500 }
      );
    }

    let analysisId = crypto.randomUUID();

    try {
      const { data, error } = await supabase
        .from("contract_redliner_analyses")
        .insert({
          analysis_json: analysis,
          text_hash: textHash,
        })
        .select("id")
        .single();

      if (!error && data) {
        analysisId = data.id;
      }
    } catch {
      // Supabase storage is optional — continue with in-memory ID
    }

    return NextResponse.json({ analysisId, analysis });
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: "Failed to analyze contract. Please try again." },
      { status: 500 }
    );
  }
}
