import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Delete an uploaded document and everything derived from it (PRD §23).
 *
 * The stored object goes first, then the row — whose ON DELETE CASCADE takes
 * the source anchors, and with them the provenance of anything extracted from
 * this document. RLS means the .eq('id') below can only ever match a row the
 * caller owns.
 */
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

  const { data: document, error } = await supabase
    .from("plan_documents")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (document.storage_path) {
    const { error: removeError } = await supabase.storage
      .from("plan-documents")
      .remove([document.storage_path]);
    // Refuse to delete the row while the file survives — that would strand an
    // unreferenced object the user can no longer see or remove.
    if (removeError) {
      return NextResponse.json(
        { error: `Couldn't remove the stored file: ${removeError.message}` },
        { status: 502 },
      );
    }
  }

  const { error: deleteError } = await supabase.from("plan_documents").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ deleted: id });
}
