/**
 * GET /api/analysis/:id
 *
 * Returns a stored contract analysis by UUID.
 *
 * Response (per PM spec + frontend compatibility):
 * {
 *   id: string,
 *   created_at: string,
 *   analysis_json: ContractAnalysis,   // PM spec field
 *   text_hash: string,
 *   analysis: ContractAnalysis,        // alias — frontend reads data.analysis
 *   disclaimer: string
 * }
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const DISCLAIMER =
  "This analysis is for informational purposes only and does not constitute legal advice. " +
  "Always consult a qualified attorney before signing any contract.";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Promise<{ id: string }>;

export async function GET(
  _request: Request,
  { params }: { params: Params }
): Promise<NextResponse> {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid analysis ID.", disclaimer: DISCLAIMER },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabaseServer
      .from("contract_redliner_analyses")
      .select("id, analysis_json, text_hash, created_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Analysis not found.", disclaimer: DISCLAIMER },
        { status: 404 }
      );
    }

    return NextResponse.json({
      // PM spec fields
      id: data.id,
      created_at: data.created_at,
      analysis_json: data.analysis_json,
      text_hash: data.text_hash,
      // Frontend alias: results page reads `data.analysis`
      analysis: data.analysis_json,
      disclaimer: DISCLAIMER,
    });
  } catch (err) {
    console.error("[analysis/id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch analysis.", disclaimer: DISCLAIMER },
      { status: 500 }
    );
  }
}
