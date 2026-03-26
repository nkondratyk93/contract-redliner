import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Params = Promise<{ id: string }>;

export async function GET(
  _request: Request,
  { params }: { params: Params }
) {
  const { id } = await params;

  try {
    const { data, error } = await supabase
      .from("contract_redliner_analyses")
      .select("analysis_json")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Analysis not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ analysis: data.analysis_json });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch analysis" },
      { status: 500 }
    );
  }
}
