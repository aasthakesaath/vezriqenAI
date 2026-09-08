import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { SIGN_IN_SCOPE_STRING, SIGN_IN_SCOPES, assertNoCalendarScope } from "@/lib/auth/scopes";

export const runtime = "nodejs";

/**
 * Starts Google sign-in through Supabase Auth.
 *
 * Supabase brokers the exchange and signs the session, so there is no
 * AUTH_SECRET and no second session system to keep in step. Requests the
 * sign-in scopes only — Calendar is a separate grant (PRD §5, §23, §30.7).
 */
export async function POST(request: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json(
      { error: "Google sign-in is not configured in this environment." },
      { status: 503 },
    );
  }

  // Belt and braces: fail loudly rather than silently escalating consent.
  assertNoCalendarScope(SIGN_IN_SCOPES);

  const form = await request.formData().catch(() => null);
  const next = typeof form?.get("next") === "string" ? String(form.get("next")) : "/start";

  const origin = new URL(request.url).origin;
  const callback = new URL("/api/auth/google/callback", origin);
  // Only same-site paths survive, so `next` cannot be used as an open redirect.
  // "//evil.com" is a protocol-relative URL and starts with "/", so the second
  // check is the one that actually matters. The callback re-validates too;
  // both ends check because either one being the sole guard is a bad shape.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/start";
  callback.searchParams.set("next", safeNext);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString(), scopes: SIGN_IN_SCOPE_STRING },
  });

  if (error || !data?.url) {
    return NextResponse.json(
      { error: error?.message ?? "Could not start Google sign-in." },
      { status: 502 },
    );
  }

  return NextResponse.redirect(data.url, 303);
}
