import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { CALENDAR_SCOPE_STRING } from "./scopes";

/**
 * Google Calendar client (PRD §11).
 *
 * Tokens are read from calendar_credentials, which has RLS enabled and no
 * policies — only the service role reaches it, so a refresh token can never be
 * selected by a browser session (§23).
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class CalendarNotConnectedError extends Error {
  constructor() {
    super("Google Calendar isn't connected.");
    this.name = "CalendarNotConnectedError";
  }
}

export class CalendarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarConfigError";
  }
}

export function calendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

export function isCalendarConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = calendarConfig();
  return Boolean(clientId && clientSecret && redirectUri);
}

export function buildConsentUrl(state: string): string {
  const { clientId, redirectUri } = calendarConfig();
  if (!clientId || !redirectUri) {
    throw new CalendarConfigError(
      "Calendar isn't configured. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_REDIRECT_URI.",
    );
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE_STRING);
  // offline + consent so a refresh token is actually issued; without it Google
  // returns one only on the very first grant, and a re-connect would silently
  // produce a connection that dies in an hour.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = calendarConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new CalendarConfigError("Calendar isn't configured.");
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google rejected the authorisation code: ${await response.text()}`);
  }
  return (await response.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = calendarConfig();
  if (!clientId || !clientSecret) throw new CalendarConfigError("Calendar isn't configured.");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Couldn't refresh Google Calendar access: ${await response.text()}`);
  }
  return (await response.json()) as TokenResponse;
}

/** Stores tokens encrypted. Called only from the OAuth callback. */
export async function storeCredentials(options: {
  admin: SupabaseClient;
  userId: string;
  tokens: TokenResponse;
  googleEmail: string | null;
}) {
  const { admin, userId, tokens, googleEmail } = options;

  const access = encryptToken(tokens.access_token);
  const refresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;

  await admin.from("calendar_credentials").upsert({
    user_id: userId,
    access_token_cipher: access.cipher,
    // Reuse the access token's IV/tag columns for the pair; each encryptToken
    // call generates its own nonce, so the refresh token carries its own below.
    refresh_token_cipher: refresh ? `${refresh.cipher}:${refresh.iv}:${refresh.authTag}` : null,
    token_iv: access.iv,
    token_auth_tag: access.authTag,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });

  await admin.from("calendar_connections").upsert({
    user_id: userId,
    provider: "google",
    scopes: tokens.scope.split(" "),
    google_email: googleEmail,
    status: "connected",
    connected_at: new Date().toISOString(),
  });
}

/** Returns a usable access token, refreshing it when it has expired. */
export async function getAccessToken(options: {
  admin: SupabaseClient;
  userId: string;
}): Promise<string> {
  const { admin, userId } = options;

  const { data } = await admin
    .from("calendar_credentials")
    .select("access_token_cipher, refresh_token_cipher, token_iv, token_auth_tag, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) throw new CalendarNotConnectedError();

  const notExpired = data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000;
  if (notExpired) {
    return decryptToken({
      cipher: data.access_token_cipher,
      iv: data.token_iv,
      authTag: data.token_auth_tag,
    });
  }

  if (!data.refresh_token_cipher) {
    await admin.from("calendar_connections").update({ status: "error" }).eq("user_id", userId);
    throw new CalendarNotConnectedError();
  }

  const [cipher, iv, authTag] = data.refresh_token_cipher.split(":");
  const refreshToken = decryptToken({ cipher: cipher!, iv: iv!, authTag: authTag! });
  const refreshed = await refreshAccessToken(refreshToken);

  const access = encryptToken(refreshed.access_token);
  await admin
    .from("calendar_credentials")
    .update({
      access_token_cipher: access.cipher,
      token_iv: access.iv,
      token_auth_tag: access.authTag,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return refreshed.access_token;
}

export type BusyPeriod = { start: Date; end: Date };

/** Busy/free only — Vezri never reads what the user is doing (§11, §23). */
export async function fetchBusyPeriods(options: {
  accessToken: string;
  from: Date;
  to: Date;
}): Promise<BusyPeriod[]> {
  const response = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: options.from.toISOString(),
      timeMax: options.to.toISOString(),
      items: [{ id: "primary" }],
    }),
  });

  if (!response.ok) throw new Error(`Calendar free/busy failed: ${await response.text()}`);

  const payload = (await response.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };

  return (payload.calendars?.primary?.busy ?? []).map((slot) => ({
    start: new Date(slot.start),
    end: new Date(slot.end),
  }));
}

export type VezriEvent = {
  summary: string;
  description: string;
  start: Date;
  end: Date;
  taskUrl: string;
};

/** Creates a Vezri block. Every event carries a marker identifying it as ours. */
export async function createEvent(options: {
  accessToken: string;
  event: VezriEvent;
}): Promise<{ id: string }> {
  const response = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: options.event.summary,
      description: `${options.event.description}\n\n${options.event.taskUrl}`,
      start: { dateTime: options.event.start.toISOString() },
      end: { dateTime: options.event.end.toISOString() },
      source: { title: "Vezriqen AI", url: options.event.taskUrl },
      extendedProperties: { private: { vezriCreated: "true" } },
    }),
  });

  if (!response.ok) throw new Error(`Couldn't create the calendar block: ${await response.text()}`);
  return (await response.json()) as { id: string };
}

/**
 * Updates a Vezri block.
 *
 * §11: "Vezri must never edit/delete a non-Vezri event." The guard is the
 * caller's stored calendar_blocks row — an event id that is not in that table
 * with vezri_created = true is never passed here. assertVezriOwned below makes
 * that check explicit at the call site.
 */
export async function updateEvent(options: {
  accessToken: string;
  eventId: string;
  start: Date;
  end: Date;
}): Promise<void> {
  const response = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(options.eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start: { dateTime: options.start.toISOString() },
        end: { dateTime: options.end.toISOString() },
      }),
    },
  );

  if (!response.ok) throw new Error(`Couldn't update the calendar block: ${await response.text()}`);
}

export async function deleteEvent(options: {
  accessToken: string;
  eventId: string;
}): Promise<void> {
  const response = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(options.eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${options.accessToken}` } },
  );
  if (!response.ok && response.status !== 410 && response.status !== 404) {
    throw new Error(`Couldn't remove the calendar block: ${await response.text()}`);
  }
}
