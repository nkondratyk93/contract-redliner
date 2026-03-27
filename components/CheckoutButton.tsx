"use client";

/**
 * CheckoutButton
 *
 * Calls /api/lemonsqueezy/checkout and redirects the user to the LemonSqueezy
 * hosted checkout page. No Stripe.js or embedded payment UI needed.
 *
 * Usage:
 *   <CheckoutButton plan="starter" variant="default" className="w-full">
 *     Start Free Trial
 *   </CheckoutButton>
 */

import { useState } from "react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Plan = "starter" | "pro";

interface CheckoutButtonProps {
  plan: Plan;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "link" | "destructive" | "secondary";
  className?: string;
}

export function CheckoutButton({
  plan,
  children,
  variant = "default",
  className,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/lemonsqueezy/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      // Redirect to LemonSqueezy hosted checkout — no embedded JS needed
      window.location.href = data.url;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          buttonVariants({ variant }),
          "w-full disabled:opacity-60 disabled:cursor-not-allowed",
          className
        )}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Redirecting…
          </>
        ) : (
          children
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}
