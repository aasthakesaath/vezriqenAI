/**
 * PRD §4.9 — "Show whether an item came from the uploaded plan or was inferred
 * by Vezri", and §20 — "Clearly label inferred items."
 *
 * The excerpt is shown on hover/focus so the user can check Vezri's reading
 * against their own document without leaving the page.
 */
export default function ProvenanceBadge({
  origin,
  confidence,
  excerpt,
}: {
  origin: "explicit" | "inferred";
  confidence: number;
  excerpt?: string | null;
}) {
  const fromPlan = origin === "explicit";
  const lowConfidence = confidence < 0.6;

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium",
        fromPlan ? "bg-blush-light text-berry" : "bg-cream text-mauve",
      ].join(" ")}
      title={excerpt ? `From your plan: “${excerpt}”` : undefined}
    >
      {fromPlan ? "From your plan" : "Vezri inferred"}
      {lowConfidence && !fromPlan && (
        <span className="text-mauve-light" aria-label="low confidence">
          · unsure
        </span>
      )}
    </span>
  );
}
