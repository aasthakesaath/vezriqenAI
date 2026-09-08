import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Milestone 2 entry point for Google OAuth. Kept deliberately thin: it only
 * verifies configuration and hands off. Requests the sign-in scopes only —
 * Calendar consent is a separate, later grant (PRD §5, §23, §30.7).
 */
export async function POST() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Google sign-in is not configured in this environment." },
      { status: 503 },
    );
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url.toString(), 303);
}
