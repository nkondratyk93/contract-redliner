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

  // Probe with a real inference call — only way to confirm the key works for messages.create
  // Use 1 max_token to minimize cost (fractions of a cent)
  let status: CheckStatus;
  try {
    await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    status = "ok";
  } catch (err: unknown) {
    const httpStatus = (err as { status?: number })?.status;
    // 401/403 = invalid key or no access; 429 = rate limited (key works); 5xx = Anthropic down
    if (httpStatus === 401 || httpStatus === 403) {
      status = "error";
    } else if (httpStatus === 429) {
      status = "ok"; // rate limited means key is valid
    } else {
      status = "error"; // treat other failures conservatively
    }
    console.warn("[health] Anthropic probe status:", httpStatus, (err as Error).message);
  }

  anthropicCache = { status, expiresAt: Date.now() + CACHE_TTL_MS };
  return status;
}

export async function GET(request: Request): Promise<NextResponse> {
  // Internal-only: if HEALTH_CHECK_TOKEN is set, require it in Authorization header
  const healthToken = process.env.HEALTH_CHECK_TOKEN;
  if (healthToken) {
    const authHeader = request.headers.get("authorization") ?? "";
    const provided = authHeader.replace("Bearer ", "").trim();
    if (!provided || provided !== healthToken) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid health check token." },
        { status: 401 }
      );
    }
  }

  const [dbResult, anthropicKeyStatus] = await Promise.allSettled([
    supabaseServer.from("contract_redliner_analyses").select("id").limit(1),
    checkAnthropicKey(),
  ]);

  const dbOk =
    dbResult.status === "fulfilled" && !dbResult.value.error;

  const lsApiKey = process.env.LEMONSQUEEZY_API_KEY;
  const lsKeyStatus: CheckStatus = lsApiKey ? "ok" : "missing";

  const checks: Record<string, CheckStatus> = {
    server: "ok",
    database: dbOk ? "ok" : "error",
    anthropic_key:
      anthropicKeyStatus.status === "fulfilled"
        ? anthropicKeyStatus.value
        : "error",
    supabase_service_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "ok" : "missing",
    lemonsqueezy_key: lsKeyStatus,
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
