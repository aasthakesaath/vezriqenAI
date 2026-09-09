import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { confirmsDeletion, DELETE_PHRASE } from "@/lib/delete-confirmation";
import {
  collectObjects,
  goalStoragePrefix,
  removeObjects,
  StorageSweepError,
} from "@/lib/storage/plan-documents";

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
    /** Cosmetic label. Editable wherever the goal is (UI spec §2). */
    short_label: z.string().min(1).max(80).optional(),
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
    .select("id, normalized_goal, short_label, target_date, success_criteria, primary_flag, status")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(data);
}

/**
 * Delete a goal and everything derived from it (PRD §23).
 *
 * The typed phrase is required here as well as in the control. A goal can
 * carry hundreds of tasks and the plan document they were read from; a DELETE
 * that any signed-in request could fire without it would make the confirmation
 * decorative. RLS means the `.eq("id")` below can only ever match a goal the
 * caller owns.
 */
const DeleteBody = z.object({ confirm: z.string() }).strict();

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const parsed = DeleteBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !confirmsDeletion(parsed.data.confirm)) {
    return NextResponse.json({ error: `Type ${DELETE_PHRASE} to confirm.` }, { status: 400 });
  }

  // 404 rather than a cheerful "deleted" for a goal that was never there —
  // the control tells the user their goal is gone, so it must not say so
  // about something the delete never matched.
  const { data: goal } = await supabase.from("goals").select("id").eq("id", id).maybeSingle();
  if (!goal) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Stored objects first; the row cascade cannot reach object storage.
  //
  // The whole `<user_id>/<goal_id>` prefix goes, not just the paths the
  // document rows record. Reading the rows alone left behind any upload whose
  // row insert failed — a file in the bucket that nothing points at, which the
  // user can no longer see or delete. The rows are still passed in, so a
  // document stored somewhere unexpected is not missed either.
  const { data: documents } = await supabase
    .from("plan_documents")
    .select("storage_path")
    .eq("goal_id", id);

  let filesRemoved = 0;
  try {
    const paths = await collectObjects({
      client: supabase,
      prefix: goalStoragePrefix(user.id, id),
      recordedPaths: (documents ?? []).map((d) => d.storage_path),
    });
    filesRemoved = await removeObjects(supabase, paths);
  } catch (thrown) {
    // Refuse to delete the rows while any file survives, and say how many did
    // go. Deleting rows over a partial removal would report success for files
    // that are still there, which is the one outcome worse than an error.
    if (thrown instanceof StorageSweepError) {
      return NextResponse.json(
        { error: thrown.message, files_removed: thrown.removed },
        { status: 502 },
      );
    }
    throw thrown;
  }

  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: id, files_removed: filesRemoved });
}
