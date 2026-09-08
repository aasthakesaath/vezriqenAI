import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";

/**
 * User edits to the target before activation (PRD §5 Step 5 "Adjust", §6
 * "Allow the user to override Vezri").
 *
 * Only the fields the confirmation card exposes are accepted — an unexpected
 * key is a validation failure, not a silent partial update.
 */
const PatchSchema = z
  .object({
    normalized_goal: z.string().min(1).max(400).optional(),
    target_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    success_criteria: z.array(z.string().min(1).max(300)).max(10).optional(),
    primary_flag: z.boolean().optional(),
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

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That change isn't valid." }, { status: 400 });
  }

  // One primary goal per user (PRD §27); clear the old one first so the
  // partial unique index cannot reject the update.
  if (parsed.data.primary_flag) {
    await supabase.from("goals").update({ primary_flag: false }).eq("primary_flag", true);
  }

  const { data, error } = await supabase
    .from("goals")
    .update(parsed.data)
    .eq("id", id)
    .select("id, normalized_goal, target_date, success_criteria, primary_flag, status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(data);
}

/** PRD §23 — a user can delete a goal and everything derived from it. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  // Remove stored objects first; the row cascade cannot reach object storage.
  const { data: documents } = await supabase
    .from("plan_documents")
    .select("storage_path")
    .eq("goal_id", id);

  const paths = (documents ?? []).map((d) => d.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length > 0) await supabase.storage.from("plan-documents").remove(paths);

  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: id });
}
