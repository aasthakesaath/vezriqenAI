import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { isValidTimeZone } from "@/lib/time-zone";

export const runtime = "nodejs";

const ProfileSchema = z
  .object({
    reminder_style: z.enum(["early_heads_up", "close_to_task", "both"]).optional(),
    accountability_level: z.enum(["gentle", "balanced", "keep_me_accountable"]).optional(),
    productive_window: z.enum(["morning", "afternoon", "evening", "varies"]).optional(),
    /** In-app has no flag: it is always on (see migration 0006). */
    email_reminders: z.boolean().optional(),
    quiet_hours_start: z.number().int().min(0).max(23).nullable().optional(),
    quiet_hours_end: z.number().int().min(0).max(23).nullable().optional(),
    // An IANA name the runtime actually knows. A zone Intl cannot format is
    // worse than no zone at all: it would throw on every date the user sees.
    timezone: z
      .string()
      .max(64)
      .refine(isValidTimeZone, "Unknown timezone")
      .optional(),
    /**
     * True when the user picked the zone themselves in Settings.
     *
     * The browser capture sends this false (or omits it), and the server
     * refuses to let that overwrite a zone someone chose by hand — so a
     * traveller's laptop cannot quietly move their reminders.
     */
    timezone_chosen: z.boolean().optional(),
  })
  .strict();

/** PRD §3, §10 — reminder intensity and quiet hours. */
export async function PATCH(request: Request) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const parsed = ProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid setting." }, { status: 400 });

  const { timezone_chosen: chosen, ...fields } = parsed.data;
  const update: Record<string, unknown> = { ...fields };

  if (fields.timezone !== undefined) {
    if (chosen) {
      update.timezone_set_by_user = true;
    } else {
      // Automatic capture. Read the flag first rather than trusting the
      // caller: this endpoint is reachable by anything holding the session.
      const { data: existing } = await supabase
        .from("profiles")
        .select("timezone_set_by_user")
        .eq("id", user.id)
        .maybeSingle();
      if (existing?.timezone_set_by_user) delete update.timezone;
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id)
    .select(
      "reminder_style, accountability_level, productive_window, email_reminders, quiet_hours_start, quiet_hours_end, timezone, timezone_set_by_user",
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
