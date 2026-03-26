/**
 * GET /api/health
 * Liveness + readiness probe.
 *
 * Anthropic key check: makes a real lightweight API call (models.list) to
 * confirm the key is valid and has API access. Result cached for 60s to
 * avoid hammering Anthropic on every uptime ping.
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { anthropic } from "@/lib/anthropic";

type CheckStatus = "ok" | "error" | "missing";

interface AnthropicCacheEntry {
  status: CheckStatus;
  expiresAt: number;
}

// Module-level cache — persists across requests in the same warm function instance
let anthropicCache: AnthropicCacheEntry | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function checkAnthropicKey(): Promise<CheckStatus> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "placeholder") return "missing";

  // Return cached result if still fresh
  if (anthropicCache && Date.now() < anthropicCache.expiresAt) {
    return anthropicCache.status;
  }

  // Probe with a minimal API call — models.list is cheap and doesn't generate tokens
  let status: CheckStatus;
  try {
    await anthropic.models.list();
    status = "ok";
  } catch (err: unknown) {
    const httpStatus = (err as { status?: number })?.status;
    // 401 = invalid key, 403 = no access; anything else (429, 5xx) = key present but API issue
    status = httpStatus === 401 || httpStatus === 403 ? "error" : "ok";
    console.warn("[health] Anthropic probe failed:", httpStatus, (err as Error).message);
  }

  anthropicCache = { status, expiresAt: Date.now() + CACHE_TTL_MS };
  return status;
}

export async function GET(): Promise<NextResponse> {
  const [dbResult, anthropicKeyStatus] = await Promise.allSettled([
    supabaseServer.from("contract_redliner_analyses").select("id").limit(1),
    checkAnthropicKey(),
  ]);

  const dbOk =
    dbResult.status === "fulfilled" && !dbResult.value.error;

  const checks: Record<string, CheckStatus> = {
    server: "ok",
    database: dbOk ? "ok" : "error",
    anthropic_key:
      anthropicKeyStatus.status === "fulfilled"
        ? anthropicKeyStatus.value
        : "error",
    supabase_service_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "ok" : "missing",
  };

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      ts: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        // Tell uptime monitors not to cache this
        "Cache-Control": "no-store",
      },
    }
  );
}
