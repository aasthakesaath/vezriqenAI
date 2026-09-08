"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseBrowserConfig } from "@/lib/env";

/**
 * Browser Supabase client. Carries the anon key only; every read and write it
 * performs is constrained by RLS, so it is never trusted to scope by user id.
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseBrowserConfig();
  return createBrowserClient(url, anonKey);
}
