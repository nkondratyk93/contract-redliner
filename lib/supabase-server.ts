/**
 * Server-only Supabase client — uses service role key.
 * NEVER import this from client components or pages.
 * Only for API routes (server-side only).
 *
 * Service role key bypasses RLS — use it carefully.
 * Never falls back to anon key — fails fast if misconfigured.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error(
    "[supabase-server] SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "This key is required for server-side operations. " +
      "Add it to .env.local or Vercel environment variables (never NEXT_PUBLIC_)."
  );
}

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
