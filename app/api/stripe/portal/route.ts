/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session so users can manage/cancel
 * their subscription without any custom UI.
 *
 * Requires Supabase auth.
 * Response: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase-server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://contractredliner.kolya.app";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No active subscription found." },
      { status: 404 }
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${APP_URL}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
