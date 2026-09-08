import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FALLBACK_TIME_ZONE, safeTimeZone } from "@/lib/time-zone";

/**
 * The settings that change what a date MEANS, read in one place.
 *
 * Every screen that shows a day, and every job that decides something is due,
 * needs the user's timezone. Reading it ad hoc is how half the product ends up
 * on the server's clock, so it is loaded here and passed down explicitly.
 */

export type UserSettings = {
  timeZone: string;
  timeZoneSetByUser: boolean;
  /** 0–23, or null when the user has not set a window. */
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  productiveWindow: "morning" | "afternoon" | "evening" | "varies";
  emailReminders: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  timeZone: FALLBACK_TIME_ZONE,
  timeZoneSetByUser: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  productiveWindow: "varies",
  emailReminders: true,
};

type ProfileRow = {
  timezone: string | null;
  timezone_set_by_user: boolean | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  productive_window: UserSettings["productiveWindow"] | null;
  email_reminders: boolean | null;
};

export function settingsFromProfile(profile: Partial<ProfileRow> | null): UserSettings {
  return {
    timeZone: safeTimeZone(profile?.timezone),
    timeZoneSetByUser: profile?.timezone_set_by_user ?? false,
    quietHoursStart: profile?.quiet_hours_start ?? null,
    quietHoursEnd: profile?.quiet_hours_end ?? null,
    productiveWindow: profile?.productive_window ?? "varies",
    emailReminders: profile?.email_reminders ?? true,
  };
}

export const USER_SETTINGS_COLUMNS =
  "timezone, timezone_set_by_user, quiet_hours_start, quiet_hours_end, productive_window, email_reminders";

/** The signed-in user's settings. Falls back rather than throwing: a missing profile must not blank a page. */
export async function loadUserSettings(supabase: SupabaseClient): Promise<UserSettings> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_USER_SETTINGS;

  const { data } = await supabase
    .from("profiles")
    .select(USER_SETTINGS_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  return settingsFromProfile(data as ProfileRow | null);
}
