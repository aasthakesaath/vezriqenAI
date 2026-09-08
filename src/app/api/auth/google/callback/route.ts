import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextDestination } from "@/lib/auth/next-destination";

export const runtime = "nodejs";

/**
 * Supabase's code-exchange callback. Named for Google because that was the only
 * caller when it was written; email confirmation and password-reset links now
 * come through it too, since it is the URL already registered in Supabase's
 * Redirect URLs list and every one of them needs the same exchange. Renaming it
 * would mean reconfiguring Supabase for no behavioural gain.
 *
 * Exchanges the one-time code for a session cookie.
 *
 * Note the two different redirect URIs this flow needs, which are easy to
 * confuse: Google Cloud is configured with Supabase's callback
 * (https://<ref>.supabase.co/auth/v1/callback), while this route is registered
 * in Supabase's own Redirect URLs list.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // An attacker-supplied `next` must not leave the site. Same guard as the
  // start route and the email actions.
  const next = safeNextDestination(url.searchParams.get("next"));

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
