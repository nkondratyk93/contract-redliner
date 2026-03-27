/**
 * POST /api/lemonsqueezy/webhook
 *
 * Handles LemonSqueezy webhook events.
 * Signature: HMAC-SHA256 verified via X-Signature header.
 *
 * Events handled:
 *   subscription_created   → activate subscription, update plan in profiles
 *   subscription_updated   → plan change / renewal sync
 *   subscription_cancelled → downgrade to free
 *   order_created          → logged for audit trail
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import type { Plan } from "@/lib/lemonsqueezy";

const WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "";

function verifySignature(rawBody: string, signature: string): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase(), "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

function planFromVariantId(variantId: string | number): Plan {
  const id = String(variantId);
  if (id === (process.env.LEMONSQUEEZY_VARIANT_STARTER ?? "")) return "starter";
  if (id === (process.env.LEMONSQUEEZY_VARIANT_PRO ?? "")) return "pro";
  return "free";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!WEBHOOK_SECRET) {
    console.error("[lemonsqueezy/webhook] LEMONSQUEEZY_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? "";

  if (!verifySignature(rawBody, signature)) {
    console.error("[lemonsqueezy/webhook] Signature verification failed");
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const meta = (event.meta as Record<string, unknown>) ?? {};
  const eventName = meta.event_name as string;
  const eventId = meta.webhook_id as string | undefined;

  // Idempotency: skip if already processed
  if (eventId) {
    const { data: existing } = await supabaseServer
      .from("contract_redliner_lemonsqueezy_events")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  const data = (event.data as Record<string, unknown>) ?? {};
  const attrs = (data.attributes as Record<string, unknown>) ?? {};
  const customData =
    (attrs.custom_data as Record<string, unknown>) ??
    (meta.custom_data as Record<string, unknown>) ??
    {};

  const userId = customData.supabase_user_id as string | undefined;
  const subscriptionId = data.id as string | undefined;
  const variantId = attrs.variant_id as string | number | undefined;
  const status = attrs.status as string | undefined;
  const customerId = String(attrs.customer_id ?? "");

  try {
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated": {
        if (!userId) {
          console.warn("[lemonsqueezy/webhook] Missing supabase_user_id", { eventName, eventId });
          break;
        }
        const plan = planFromVariantId(variantId ?? "");
        const isActive = ["active", "on_trial"].includes(status ?? "");

        await supabaseServer.from("profiles").upsert(
          {
            id: userId,
            lemonsqueezy_subscription_id: subscriptionId,
            lemonsqueezy_customer_id: customerId,
            plan: isActive ? plan : "free",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
        console.log(
          `[lemonsqueezy/webhook] ${eventName}: user=${userId} plan=${plan} active=${isActive}`
        );
        break;
      }

      case "subscription_cancelled": {
        if (!userId) break;
        await supabaseServer.from("profiles").upsert(
          {
            id: userId,
            plan: "free" as Plan,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
        console.log(`[lemonsqueezy/webhook] subscription_cancelled: user=${userId} → free`);
        break;
      }

      case "order_created": {
        console.log("[lemonsqueezy/webhook] order_created", { eventId, userId });
        break;
      }

      default:
        console.log("[lemonsqueezy/webhook] Unhandled event:", eventName);
    }

    // Audit log (best-effort — don't fail the webhook if this errors)
    if (eventId) {
      await supabaseServer
        .from("contract_redliner_lemonsqueezy_events")
        .insert({
          event_id: eventId,
          event_name: eventName,
          user_id: userId ?? null,
          payload: event as unknown as Record<string, unknown>,
        })
        .then(({ error }) => {
          if (error) console.warn("[lemonsqueezy/webhook] Audit log failed:", error.message);
        });
    }
  } catch (err) {
    // Log but return 200 — LemonSqueezy retries on non-200, causing loops
    console.error("[lemonsqueezy/webhook] Processing error:", (err as Error).message);
  }

  return NextResponse.json({ received: true });
}
