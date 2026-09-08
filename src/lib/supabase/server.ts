import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseBrowserConfig } from "@/lib/env";

/**
 * Server Supabase client bound to the request's cookies.
 *
 * Still the anon key, still subject to RLS. Running on the server does not
 * elevate it — that is deliberate, and it is why route handlers can pass user
 * input straight through without hand-rolling ownership checks.
 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseBrowserConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refresh path handles rotation, so this is safe to skip.
        }
      },
    },
  });
}

/**
 * The authenticated user, or null.
 *
 * Uses getUser() rather than getSession(): getSession reads the cookie without
 * verifying it, so it can be spoofed. getUser revalidates against the auth
 * server and is the only form safe to gate access on.
 */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
