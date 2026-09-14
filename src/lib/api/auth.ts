import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";

/**
 * One way for a route handler to find out who is calling.
 *
 * Every authenticated route had its own copy of the same six lines:
 *
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
 *
 * Six lines repeated twenty times is not a problem until one of them returns
 * 401 in production and the others do not — and then the first question is
 * "do they differ?", which takes a diff of twenty files to answer. They did
 * not differ. That is worth being able to establish in one file rather than
 * twenty, so the copies are gone and this is the only path.
 *
 * THE ERROR IS NOT DISCARDED. `auth.getUser()` returns `{ data, error }` and
 * every one of those copies destructured `data` and dropped `error` on the
 * floor. A 401 therefore reached the user as "Please sign in first." whether
 * the cookie was absent, expired, malformed, refused by the auth server, or
 * unreachable because of a network fault — four different causes, one
 * message, and nothing in the log to tell them apart. A production 401 on a
 * signed-in session was consequently undiagnosable from the outside. It is
 * logged here, once, with the route that saw it.
 */

export const SIGN_IN_MESSAGE = "Please sign in first.";

export type Authenticated = {
  ok: true;
  supabase: SupabaseClient;
  user: User;
};

export type Unauthenticated = {
  ok: false;
  /** Ready to return. Never construct the 401 at the call site. */
  response: NextResponse;
};

/**
 * The caller and a client bound to their cookies, or the response to return.
 *
 * `route` names the caller for the log line — "tasks/[id]/stuck", not a stack
 * trace. It is the only argument because everything else about authenticating
 * a request should be identical everywhere, and an argument is an invitation
 * for it not to be.
 */
export async function requireUser(route: string): Promise<Authenticated | Unauthenticated> {
  if (!SUPABASE_CONFIGURED) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not configured." }, { status: 503 }),
    };
  }

  // Bound to the request's cookies by next/headers. The same helper the pages
  // use — running on the server does not elevate it, and RLS still applies.
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    // Server-side only. The user gets one sentence; we get the cause.
    //
    // AuthSessionMissingError  no auth cookie reached the handler at all
    // AuthApiError 401         the token was rejected — expired, or a refresh
    //                          token already rotated by a concurrent request
    // AuthRetryableFetchError  the auth server could not be reached
    //
    // The third is not the user's fault and is not "please sign in", but it
    // is indistinguishable from the other two without this line.
    console.warn(
      `[auth] ${route}: no caller — ` +
        (error
          ? `${error.name}${typeof error.status === "number" ? ` ${error.status}` : ""}: ${error.message}`
          : "getUser returned no user and no error"),
    );
    return {
      ok: false,
      response: NextResponse.json({ error: SIGN_IN_MESSAGE }, { status: 401 }),
    };
  }

  return { ok: true, supabase, user: data.user };
}
