/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for a subscription.
 * Requires Supabase auth (user must be signed in).
 *
 * Body: { plan: "starter" | "pro", successUrl?: string, cancelUrl?: string }
 * Response: { url: string } — redirect user to this URL
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICES, type Plan } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { z } from "zod";

const BodySchema = z.object({
  plan: z.enum(["starter", "pro"]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://contractredliner.kolya.app";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth: extract Supabase JWT ─────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { plan, successUrl, cancelUrl } = parsed.data;
  const priceId = PRICES[plan];

  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price ID for plan "${plan}" is not configured. Contact support.` },
      { status: 503 }
    );
  }

  // ── Get or create Stripe customer ─────────────────────────────────────────
  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("stripe_customer_id, plan")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await supabaseServer
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // ── Create Checkout session ────────────────────────────────────────────────
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl ?? `${APP_URL}/dashboard?upgraded=true`,
    cancel_url: cancelUrl ?? `${APP_URL}/pricing?cancelled=true`,
    metadata: {
      supabase_user_id: user.id,
      plan,
    },
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
