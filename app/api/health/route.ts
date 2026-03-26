/**
 * GET /api/health
 * Lightweight liveness + readiness probe.
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, "ok" | "error" | "missing"> = {
    server: "ok",
    database: "error",
    anthropic_key: process.env.ANTHROPIC_API_KEY ? "ok" : "missing",
  };

  try {
    const { error } = await supabase
      .from("contract_redliner_analyses")
      .select("id")
      .limit(1);
    checks.database = error ? "error" : "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, ts: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
