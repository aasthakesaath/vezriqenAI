import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, storeCredentials } from "@/lib/calendar/google";
import { CALENDAR_SCOPES } from "@/lib/calendar/scopes";
import { verifyEmailActionToken } from "@/lib/crypto/tokens";
import { SITE_URL } from "@/lib/env";

export const runtime = "nodejs";

/** Google Calendar consent callback (PRD §11). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const settings = new URL("/settings", SITE_URL);

  const error = url.searchParams.get("error");
  if (error) {
    // Declining is a supported outcome, not a failure — §11 makes Calendar
    // optional and §27 says it must stay declinable.
    settings.searchParams.set("calendar", "declined");
    return NextResponse.redirect(settings, 303);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    settings.searchParams.set("calendar", "error");
    return NextResponse.redirect(settings, 303);
  }

  const verified = verifyEmailActionToken(state);
  if (!verified.valid) {
    settings.searchParams.set("calendar", "error");
    return NextResponse.redirect(settings, 303);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The state carries the user this consent was started for; it must match the
  // session redeeming it.
  if (!user || user.id !== verified.payload.taskId) {
    settings.searchParams.set("calendar", "error");
    return NextResponse.redirect(settings, 303);
  }

  try {
    const tokens = await exchangeCode(code);

    // Google may return fewer scopes than were asked for. Storing what was
    // actually granted keeps the UI honest about what Vezri can do.
    const granted = tokens.scope.split(" ");
    const missing = CALENDAR_SCOPES.filter((scope) => !granted.includes(scope));

    await storeCredentials({
      admin: createAdminClient(),
      userId: user.id,
      tokens,
      googleEmail: user.email ?? null,
    });

    settings.searchParams.set("calendar", missing.length > 0 ? "partial" : "connected");
  } catch {
    settings.searchParams.set("calendar", "error");
  }

  return NextResponse.redirect(settings, 303);
}
