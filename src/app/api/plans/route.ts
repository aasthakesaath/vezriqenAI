import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUpload, validatePageCount } from "@/lib/ingest/validate";
import { extractPlanText } from "@/lib/ingest/extract";
import {
  EXTENSION_FOR_MIME,
  MAX_PASTED_CHARS,
  MIN_PLAN_CHARS,
  safeFilename,
} from "@/lib/ingest/limits";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";
/** Reading a 25 MB upload and parsing a 100-page PDF needs more than the default. */
export const maxDuration = 60;

const BUCKET = "plan-documents";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Plan intake — PRD §5 Step 2 and §7.
 *
 * Accepts an uploaded file, pasted text, or a bare goal. Everything is
 * validated and parsed in memory *before* anything is persisted, so a rejected
 * file never leaves a half-created goal behind.
 */
export async function POST(request: Request) {
  if (!SUPABASE_CONFIGURED) return bad("Vezriqen isn't configured in this environment.", 503);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Please sign in first.", 401);

  const form = await request.formData().catch(() => null);
  if (!form) return bad("Couldn't read that submission.");

  const mode = String(form.get("mode") ?? "");
  const goalText = String(form.get("goal_text") ?? "").trim();

  let mimeType: keyof typeof EXTENSION_FOR_MIME | null = null;
  let bytes: Uint8Array | null = null;
  let filename = "";
  let extractedText: string | null = null;
  let pageCount: number | null = null;
  let needsVision = false;

  if (mode === "upload") {
    const file = form.get("file");
    if (!(file instanceof File)) return bad("Choose a file to upload.");

    bytes = new Uint8Array(await file.arrayBuffer());
    const verdict = validateUpload({
      bytes,
      declaredMimeType: file.type,
      filename: file.name,
    });
    if (!verdict.ok) return bad(verdict.message, verdict.code === "too_large" ? 413 : 415);

    mimeType = verdict.mimeType;
    filename = safeFilename(file.name);

    const extraction = await extractPlanText(bytes, verdict.mimeType);
    if (!extraction.ok) {
      const pageLimit = validatePageCount(extraction.pageCount);
      return bad(extraction.reason, pageLimit ? 413 : 422);
    }
    extractedText = extraction.text;
    pageCount = extraction.pageCount;
    needsVision = extraction.needsVision;
  } else if (mode === "paste") {
    const pasted = String(form.get("plan_text") ?? "").trim();
    if (pasted.length < MIN_PLAN_CHARS) {
      return bad(`Paste a bit more of the plan — at least ${MIN_PLAN_CHARS} characters.`);
    }
    if (pasted.length > MAX_PASTED_CHARS) {
      return bad(`That's longer than we can take at once. Upload it as a file instead.`, 413);
    }
    extractedText = pasted;
    mimeType = "text/plain";
    filename = "Pasted plan";
  } else if (mode === "goal_only") {
    if (goalText.length === 0) return bad("Tell Vezri what you're trying to achieve.");
  } else {
    return bad("Choose whether to upload a plan, paste one, or start from a goal.");
  }

  // ---- Persist. RLS scopes every write below to this user. ----
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .insert({ user_id: user.id, user_goal_text: goalText || null, status: "draft" })
    .select("id")
    .single();

  if (goalError || !goal) return bad(goalError?.message ?? "Couldn't start that goal.", 500);

  if (mode === "goal_only") {
    return NextResponse.json({ goal_id: goal.id, document_id: null }, { status: 201 });
  }

  let storagePath: string | null = null;
  if (mode === "upload" && bytes && mimeType) {
    // First path segment is the user id — the storage policies key off it.
    storagePath = `${user.id}/${goal.id}/${crypto.randomUUID()}.${EXTENSION_FOR_MIME[mimeType]}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      // Roll the goal back rather than leave a goal with no plan attached.
      await supabase.from("goals").delete().eq("id", goal.id);
      return bad(`Couldn't store that file: ${uploadError.message}`, 502);
    }
  }

  const { data: document, error: documentError } = await supabase
    .from("plan_documents")
    .insert({
      user_id: user.id,
      goal_id: goal.id,
      filename,
      mime_type: mimeType,
      byte_size: bytes?.byteLength ?? Buffer.byteLength(extractedText ?? "", "utf8"),
      page_count: pageCount,
      storage_path: storagePath,
      source_kind: mode === "paste" ? "paste" : "upload",
      extracted_text: extractedText,
      // An image has nothing to parse yet; the vision pass in Milestone 3 does it.
      parse_status: needsVision ? "pending" : "parsed",
    })
    .select("id")
    .single();

  if (documentError || !document) {
    if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
    await supabase.from("goals").delete().eq("id", goal.id);
    return bad(documentError?.message ?? "Couldn't save that plan.", 500);
  }

  return NextResponse.json({ goal_id: goal.id, document_id: document.id }, { status: 201 });
}
