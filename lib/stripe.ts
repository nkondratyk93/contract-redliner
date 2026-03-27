/**
 * Server-only Stripe client.
 * NEVER import this from client components.
 */
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV === "production") {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — payment endpoints will fail");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

// ── Price IDs (set in Vercel env) ─────────────────────────────────────────────
export const PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "", // $19/mo — 10 contracts/mo
  pro:     process.env.STRIPE_PRICE_PRO     ?? "", // $49/mo — unlimited
} as const;

// ── Plan definitions ──────────────────────────────────────────────────────────
export type Plan = "free" | "starter" | "pro";

export const PLAN_LIMITS: Record<Plan, number | null> = {
  free:    3,    // 3 analyses / 24h (in-memory rate limit)
  starter: 10,   // 10 analyses / calendar month
  pro:     null, // unlimited
};

export const PLAN_LABELS: Record<Plan, string> = {
  free:    "Free",
  starter: "Starter ($19/mo)",
  pro:     "Pro ($49/mo)",
};
