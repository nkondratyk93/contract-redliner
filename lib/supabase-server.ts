/**
 * Server-only Supabase client — uses service role key.
 * NEVER import this from client components or pages.
 * Only for API routes (server-side only).
 *
 * Service role key bypasses RLS — use it carefully.
 * It's stored as a non-NEXT_PUBLIC_ env var so it's never embedded in the browser bundle.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!serviceRoleKey) {
  // In development, warn loudly. In production, this will cause RLS bypass to fail safely.
  console.warn("[supabase-server] SUPABASE_SERVICE_ROLE_KEY is not set — service role client will not work correctly");
}

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
