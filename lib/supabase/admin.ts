import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-only operations that must bypass RLS —
 * e.g. a Supabase webhook sending a push notification to a user who isn't
 * the one making the request.
 *
 * NEVER import this from a Client Component, and NEVER prefix
 * SUPABASE_SERVICE_ROLE_KEY with NEXT_PUBLIC_.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for admin operations."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
