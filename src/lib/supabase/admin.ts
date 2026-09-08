import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, ConfigurationError } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS entirely, so it is reserved for work no
 * user session can do: background reminder delivery and signed-link actions
 * where the actor is proven by a short-lived token rather than a cookie.
 *
 * `server-only` makes importing this from a client component a build error.
 * Every call site must scope by user id itself — RLS is not there to catch it.
 */
export function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConfigurationError("Supabase service role", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
