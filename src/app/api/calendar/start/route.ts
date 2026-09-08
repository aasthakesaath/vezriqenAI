import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildConsentUrl, isCalendarConfigured } from "@/lib/calendar/google";
import { createEmailActionToken } from "@/lib/crypto/tokens";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Starts Google Calendar consent (PRD §5, §11, §23, §30.7).
 *
 * A separate, explicit step from sign-in, using a separate Google OAuth client.
 * Reaching this route requires an existing session, so calendar access can only
 * ever be added to an account that already exists — it can never be the thing
 * that creates one.
 */
export async function POST() {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  if (!isCalendarConfigured()) {
    return NextResponse.json(
      {
        error:
          "Calendar isn't configured yet. It needs its own Google Cloud project — set GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET and GOOGLE_CALENDAR_REDIRECT_URI.",
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  // Signed state binds the callback to this user, so a stray or forged
  // authorisation code cannot attach someone else's calendar to this account.
  const { token } = createEmailActionToken(
    { taskId: user.id, reminderId: null, action: "done" },
    15,
  );

  return NextResponse.redirect(buildConsentUrl(token), 303);
}
