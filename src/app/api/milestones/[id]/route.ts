import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";

/**
 * A date the user supplies for a milestone Vezri could not date.
 *
 * The model is told to return null rather than guess a date, which is right —
 * §7 does not allow an invented date to sit next to an extracted one. But a
 * milestone with no date cannot be scheduled or health-scored, so the user
 * needs a way to supply one. It is recorded as origin "explicit": the user
 * stated it, which is the strongest provenance there is.
 */
const Body = z
  .object({
    target_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
      .nullable(),
  })
  .strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That date didn't look right." }, { status: 400 });
  }

  // RLS scopes this to the user's own rows; the explicit filter makes the
  // intent readable rather than relying on the policy alone.
  const { data, error } = await supabase
    .from("milestones")
    .update({
      target_date: parsed.data.target_date,
      // The user said so. Nothing was inferred, so nothing was anchored.
      date_anchor: parsed.data.target_date ? "You set this date" : null,
      origin: "explicit",
      confidence: 1,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, target_date, date_anchor")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(data);
}
