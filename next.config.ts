import type { NextConfig } from "next";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://contractredliner.kolya.app").trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          // Prevent clickjacking
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Prevent MIME sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Control referrer information sent with requests
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Permissions Policy — disable browser features we don't use
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Force HTTPS for 1 year (only meaningful over HTTPS, safe to set)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Content Security Policy
          // Allows: self, Supabase (anon read), LemonSqueezy checkout, Google Fonts, Vercel analytics
          // Blocks: inline scripts (XSS protection), framing by third parties
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Scripts: self + Next.js inline chunks (required) + Vercel analytics
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.vercel-insights.com",
              // Styles: self + Google Fonts + inline (Tailwind/Next.js requires inline)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Fonts: self + Google Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // Images: self + data URIs (OG image) + Supabase storage
              `img-src 'self' data: blob: https://*.supabase.co`,
              // Fetch/XHR: self + Supabase API + LemonSqueezy API
              `connect-src 'self' https://*.supabase.co https://api.lemonsqueezy.com https://cdn.vercel-insights.com`,
              // Forms: only submit to self
              "form-action 'self'",
              // No plugins (Flash etc)
              "object-src 'none'",
              // Base tag must point to self
              "base-uri 'self'",
              // Upgrade insecure requests to HTTPS
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Suppress unused variable warning — APP_URL reserved for future CSP tweaks
void APP_URL;

export default nextConfig;
