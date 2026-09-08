import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { humanFileSize } from "@/lib/ingest/limits";
import DeleteDocumentButton from "@/components/app/DeleteDocumentButton";

export const metadata: Metadata = { title: "Your plan", robots: { index: false } };

/**
 * Milestone 2 endpoint of the journey: the plan is in, and the user can see
 * exactly what Vezri received. Milestone 3 turns this into the SMART target
 * and plan confirmation of PRD §5 Steps 5-6.
 */
export default async function GoalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // No .eq('user_id', ...) anywhere: RLS scopes this to the caller. Adding a
  // client-side filter would imply the policy is not doing its job.
  const { data: goal } = await supabase
    .from("goals")
    .select("id, user_goal_text, status, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!goal) notFound();

  const { data: documents } = await supabase
    .from("plan_documents")
    .select("id, filename, mime_type, byte_size, page_count, source_kind, extracted_text, parse_status")
    .eq("goal_id", id)
    .order("created_at", { ascending: true });

  const document = documents?.[0] ?? null;
  const excerpt = document?.extracted_text?.slice(0, 1200) ?? null;

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <p className="eyebrow">Plan received</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {goal.user_goal_text?.trim() || "Your plan"}
      </h1>

      {document ? (
        <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-ink">{document.filename}</h2>
              <p className="mt-1 text-sm text-mauve">
                {document.source_kind === "paste" ? "Pasted text" : document.mime_type}
                {" · "}
                {humanFileSize(document.byte_size)}
                {document.page_count ? ` · ${document.page_count} pages` : ""}
              </p>
            </div>
            {/* PRD §23 — the user can delete an uploaded document and
                everything derived from it. */}
            <DeleteDocumentButton documentId={document.id} />
          </div>

          {document.parse_status === "pending" && (
            <p className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
              This is an image, so Vezri will read it when it builds your plan.
            </p>
          )}

          {excerpt && (
            <div className="mt-5 border-t border-blush pt-5">
              <h3 className="text-sm font-semibold text-ink">What Vezri read</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-mauve">
                {excerpt}
                {document.extracted_text && document.extracted_text.length > 1200 ? "…" : ""}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
          You started from a goal rather than a document. Vezri will build a light structure you can
          grow from.
        </p>
      )}
    </div>
  );
}
