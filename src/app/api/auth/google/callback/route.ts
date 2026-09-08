import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Google → Supabase → here. Exchanges the one-time code for a session cookie.
 *
 * Note the two different redirect URIs this flow needs, which are easy to
 * confuse: Google Cloud is configured with Supabase's callback
 * (https://<ref>.supabase.co/auth/v1/callback), while this route is registered
 * in Supabase's own Redirect URLs list.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/start";
  // Reject absolute URLs — an attacker-supplied `next` must not leave the site.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/start";

  if (!code) {
    const error = url.searchParams.get("error_description") ?? "Sign-in was cancelled.";
    const back = new URL("/signin", url.origin);
    back.searchParams.set("error", error);
    return NextResponse.redirect(back, 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const back = new URL("/signin", url.origin);
    back.searchParams.set("error", error.message);
    return NextResponse.redirect(back, 303);
  }

  return NextResponse.redirect(new URL(next, url.origin), 303);
}
