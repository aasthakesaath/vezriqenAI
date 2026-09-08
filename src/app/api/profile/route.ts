import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";

const ProfileSchema = z
  .object({
    reminder_style: z.enum(["early_heads_up", "close_to_task", "both"]).optional(),
    accountability_level: z.enum(["gentle", "balanced", "keep_me_accountable"]).optional(),
    productive_window: z.enum(["morning", "afternoon", "evening", "varies"]).optional(),
    quiet_hours_start: z.number().int().min(0).max(23).nullable().optional(),
    quiet_hours_end: z.number().int().min(0).max(23).nullable().optional(),
    timezone: z.string().max(64).optional(),
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

  const { data, error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select("reminder_style, accountability_level, productive_window, quiet_hours_start, quiet_hours_end")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
