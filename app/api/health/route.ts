/**
 * GET /api/health
 * Lightweight liveness + readiness probe.
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, "ok" | "error" | "missing"> = {
    server: "ok",
    database: "error",
    anthropic_key:
      process.env.ANTHROPIC_API_KEY &&
      process.env.ANTHROPIC_API_KEY !== "placeholder"
        ? "ok"
        : "missing",
    supabase_service_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "ok" : "missing",
  };

  try {
    const { error } = await supabaseServer
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
