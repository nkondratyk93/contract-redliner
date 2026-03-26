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

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? // fallback for local dev
  "";

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
