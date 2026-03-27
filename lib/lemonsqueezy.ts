/**
 * Server-only LemonSqueezy config.
 * NEVER import this from client components.
 *
 * LemonSqueezy uses redirect-based checkout — no embedded JS SDK needed.
 * All checkout calls go: client → /api/lemonsqueezy/checkout → LS API → return URL → redirect.
 */

if (!process.env.LEMONSQUEEZY_API_KEY && process.env.NODE_ENV === "production") {
  console.warn("[lemonsqueezy] LEMONSQUEEZY_API_KEY not set — payment endpoints will fail");
}

export const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY ?? "";
export const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID ?? "";

// ── Variant IDs (set in Vercel env) ───────────────────────────────────────────
// In LemonSqueezy, a "variant" is equivalent to a Stripe "price" (the billable SKU).
export const VARIANTS: Record<"starter" | "pro", string> = {
  starter: process.env.LEMONSQUEEZY_VARIANT_STARTER ?? "", // $19/mo
  pro:     process.env.LEMONSQUEEZY_VARIANT_PRO     ?? "", // $49/mo
};

export type Plan = "starter" | "pro";

export const LEMONSQUEEZY_BASE_URL = "https://api.lemonsqueezy.com/v1";
