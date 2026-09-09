import type { Metadata } from "next";
import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import CalendarConnection from "@/components/app/CalendarConnection";
import TimeZoneSetting from "@/components/app/TimeZoneSetting";
import { settingsFromProfile } from "@/lib/user-settings";
import ReminderPreferences from "@/components/app/ReminderPreferences";
import { isCalendarConfigured } from "@/lib/calendar/google";
import { getEmailProvider } from "@/lib/email";
import { VezriPoseImage } from "@/components/VezriWorking";
import { POSE_FOR } from "@/lib/vezri-poses";
import { APP_ROUTES } from "@/lib/routes";
import DeleteAccount from "@/components/app/DeleteAccount";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

/** PRD §3 — user controls for reminder intensity and quiet hours, plus §11. */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const { calendar } = await searchParams;
  const user = await getUser();
  const supabase = await createClient();

  // The layout redirects an anonymous request, but a layout and the page below
  // it render CONCURRENTLY in the App Router — the redirect does not stop this
  // function from running. `user!.id` therefore threw on a signed-out request,
  // which is the /settings 500 in the logs. Returning null renders nothing and
  // lets the layout's redirect land.
  if (!user) return null;

  const [{ data: profile }, { data: connection }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "reminder_style, accountability_level, productive_window, email_reminders, quiet_hours_start, quiet_hours_end, timezone, timezone_set_by_user",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("calendar_connections")
      .select("google_email, status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const settings = settingsFromProfile(profile);

  return (
    <div className="shell max-w-2xl py-12 lg:py-16">
      <Link href={APP_ROUTES.today} className="text-sm font-medium text-berry hover:underline">
        ← Today
      </Link>
      <div className="mt-4 flex items-start justify-between gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Settings</h1>
        <VezriPoseImage
          pose={POSE_FOR.goalHealth}
          alt=""
          className="h-16 w-auto shrink-0 sm:h-24"
        />
      </div>

      <div className="mt-8 space-y-6">
        <TimeZoneSetting timeZone={settings.timeZone} />

        <ReminderPreferences
          reminderStyle={profile?.reminder_style ?? "both"}
          accountability={profile?.accountability_level ?? "balanced"}
          productiveWindow={profile?.productive_window ?? "varies"}
          quietStart={profile?.quiet_hours_start ?? null}
          quietEnd={profile?.quiet_hours_end ?? null}
          emailReminders={profile?.email_reminders ?? true}
          emailConfigured={getEmailProvider().configured}
          timeZone={settings.timeZone}
        />

        <CalendarConnection
          connected={connection?.status === "connected"}
          googleEmail={connection?.google_email ?? null}
          configured={isCalendarConfigured()}
          notice={calendar ?? null}
        />
      </div>

      {/* Last, and outside the settings stack. Everything above changes how
          Vezri behaves; this ends the account. It is not a setting and does
          not sit among them. */}
      <DeleteAccount />
    </div>
  );
}
