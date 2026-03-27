/**
 * POST /api/lemonsqueezy/checkout
 *
 * Creates a LemonSqueezy checkout session and returns the checkout URL.
 * LemonSqueezy uses redirect-based checkout — no embedded JS needed.
 * Client redirects to the returned URL to complete payment.
 *
 * Body: { plan: "starter" | "pro", email?: string }
 * Response: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  LEMONSQUEEZY_API_KEY,
  LEMONSQUEEZY_STORE_ID,
  LEMONSQUEEZY_BASE_URL,
  VARIANTS,
  type Plan,
} from "@/lib/lemonsqueezy";

const BodySchema = z.object({
  plan: z.enum(["starter", "pro"]),
  email: z.string().email().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://contractredliner.kolya.app").trim();

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { plan, email, successUrl, cancelUrl } = parsed.data;
  const variantId = VARIANTS[plan as "starter" | "pro"];

  if (!variantId) {
    return NextResponse.json(
      { error: `LemonSqueezy variant ID for plan "${plan}" is not configured. Contact support.` },
      { status: 503 }
    );
  }

  if (!LEMONSQUEEZY_API_KEY || !LEMONSQUEEZY_STORE_ID) {
    return NextResponse.json(
      { error: "Payment system not configured. Contact support." },
      { status: 503 }
    );
  }

  // ── Create LemonSqueezy checkout ──────────────────────────────────────────
  // Docs: https://docs.lemonsqueezy.com/api/checkouts#create-a-checkout
  const checkoutPayload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_options: {
          embed: false,
          media: true,
          logo: true,
          desc: true,
          discount: true,
          dark: false,
          subscription_preview: true,
        },
        checkout_data: {
          email: email ?? undefined,
          custom: {
            plan,
          },
        },
        product_options: {
          redirect_url: successUrl ?? `${APP_URL}/?upgraded=true`,
        },
        expires_at: null,
        preview: false,
        test_mode: process.env.NODE_ENV !== "production",
      },
      relationships: {
        store: {
          data: { type: "stores", id: LEMONSQUEEZY_STORE_ID },
        },
        variant: {
          data: { type: "variants", id: variantId },
        },
      },
    },
  };

  let lsResponse: Response;
  try {
    lsResponse = await fetch(`${LEMONSQUEEZY_BASE_URL}/checkouts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LEMONSQUEEZY_API_KEY}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
      },
      body: JSON.stringify(checkoutPayload),
    });
  } catch (err) {
    console.error("[lemonsqueezy] Network error creating checkout:", err);
    return NextResponse.json(
      { error: "Payment service unavailable. Please try again." },
      { status: 502 }
    );
  }

  if (!lsResponse.ok) {
    const errBody = await lsResponse.text();
    console.error(`[lemonsqueezy] Checkout creation failed (${lsResponse.status}):`, errBody);
    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 502 }
    );
  }

  const lsData = await lsResponse.json() as {
    data?: { attributes?: { url?: string } };
  };

  const checkoutUrl = lsData?.data?.attributes?.url;
  if (!checkoutUrl) {
    console.error("[lemonsqueezy] No checkout URL in response:", JSON.stringify(lsData));
    return NextResponse.json(
      { error: "Unexpected response from payment service." },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: checkoutUrl });
}
