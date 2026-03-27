/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe webhook events and keeps Supabase profiles in sync.
 *
 * Events handled:
 *   checkout.session.completed   → activate subscription, update plan
 *   customer.subscription.updated → plan change / renewal
 *   customer.subscription.deleted → downgrade to free
 *   invoice.payment_failed        → log for monitoring (grace period handled by Stripe)
 *
 * Security: signature verified with STRIPE_WEBHOOK_SECRET.
 * Idempotent: duplicate events (same stripe_event_id) are silently ignored.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, type Plan } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase-server";

// Required: raw body for Stripe signature verification
export const config = { api: { bodyParser: false } };

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

function planFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscriptionId: string,
  plan: Plan,
  status: string
): Promise<void> {
  const isActive = ["active", "trialing"].includes(status);
  await supabaseServer.from("profiles").upsert(
    {
      id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      plan: isActive ? plan : "free",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}

async function logEvent(
  stripeEventId: string,
  eventType: string,
  userId: string | null,
  payload: Stripe.Event
): Promise<void> {
  await supabaseServer.from("subscription_events").insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
    user_id: userId,
    payload: payload as unknown as Record<string, unknown>,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!WEBHOOK_SECRET) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", (err as Error).message);
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  // Idempotency: check if we've already processed this event
  const { data: existing } = await supabaseServer
    .from("subscription_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .single();

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let userId: string | null = null;

  try {
    switch (event.type) {
      // ── Checkout completed → subscription starts ──────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        userId = session.metadata?.supabase_user_id ?? null;
        const plan = (session.metadata?.plan ?? "free") as Plan;

        if (userId && session.subscription && session.customer) {
          // Fetch the subscription to get the price ID
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price.id ?? "";
          const resolvedPlan = planFromPriceId(priceId) === "free" ? plan : planFromPriceId(priceId);

          await upsertSubscription(
            userId,
            session.customer as string,
            session.subscription as string,
            resolvedPlan,
            sub.status
          );
        }
        break;
      }

      // ── Subscription updated (plan change, renewal, trial end) ────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const priceId = sub.items.data[0]?.price.id ?? "";
        const plan = planFromPriceId(priceId);

        // Look up user by customer ID
        const { data: profile } = await supabaseServer
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        userId = profile?.id ?? (sub.metadata?.supabase_user_id ?? null);

        if (userId) {
          await upsertSubscription(userId, customerId, sub.id, plan, sub.status);
        }
        break;
      }

      // ── Subscription cancelled/expired → downgrade to free ────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profile } = await supabaseServer
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        userId = profile?.id ?? (sub.metadata?.supabase_user_id ?? null);

        if (userId) {
          await supabaseServer.from("profiles").update({
            plan: "free",
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          }).eq("id", userId);
        }
        break;
      }

      // ── Payment failed → log only (Stripe handles retries + grace period) ─
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const { data: profile } = await supabaseServer
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();
        userId = profile?.id ?? null;
        console.warn("[webhook] Payment failed for customer:", customerId);
        break;
      }

      default:
        // Unhandled event types — acknowledge receipt, log nothing
        return NextResponse.json({ received: true, handled: false });
    }

    // Log the event for audit trail
    await logEvent(event.id, event.type, userId, event);

  } catch (err) {
    console.error(`[webhook] Error processing ${event.type}:`, err);
    // Return 500 so Stripe retries
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
