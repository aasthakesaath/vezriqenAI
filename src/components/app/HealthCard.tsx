import Icon from "@/components/icons/Icon";
import { HEALTH_LABELS } from "@/lib/app-copy";
import type { HealthFactor, HealthStatus } from "@/lib/health/score";

const TONE: Record<HealthStatus, string> = {
  on_track: "bg-blush-light text-berry",
  needs_attention: "bg-cream text-mauve",
  at_risk: "bg-cream text-berry",
  off_track: "bg-blush-light text-berry-deep",
  achieved: "bg-blush-light text-berry",
};

/**
 * PRD §15 Goal Health.
 *
 * The score, the state, and the factors that produced them — because a status
 * with no reasons is exactly the "percent of tasks completed" number §15
 * rejects, and a number nobody can act on is decoration.
 *
 * Everything numeric here is computed by lib/health/score.ts from stored
 * inputs: weighted milestone progress against elapsed time, overdue work,
 * unresolved dependencies, unanswered checkpoints, capacity, evidence. The
 * model never picks the number. It may write `recommendation`, and that is
 * the only sentence on this card it has ever touched — which is why the card
 * says so out loud rather than leaving the user to wonder.
 */
export default function HealthCard({
  title,
  score,
  status,
  factors,
  weakest,
  recommendation,
}: {
  title: string;
  /** 0–100, deterministic. */
  score: number;
  status: HealthStatus;
  factors: HealthFactor[];
  /** The factor doing the most damage, for the plain-language line. */
  weakest?: HealthFactor | null;
  recommendation?: string | null;
}) {
  const shown = factors.filter((f) => f.weight > 0);
  // Only worth naming when it is actually pulling the score down; at 1 the
  // factor is healthy and "what's dragging it down: nothing" is noise.
  const dragging = weakest && weakest.value < 0.95 ? weakest : null;

  return (
    <section
      aria-labelledby="health-heading"
      className="rounded-3xl border border-blush bg-white p-5 shadow-soft"
    >
      <h2 id="health-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Icon name="health" className="h-5 w-5 text-berry" />
        {title}
      </h2>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <p className="text-3xl font-bold tracking-tight text-ink">
          {score}
          <span className="ml-1 text-base font-medium text-mauve-light">/ 100</span>
        </p>
        <span className={`rounded-pill px-3 py-1 text-sm font-semibold ${TONE[status]}`}>
          {HEALTH_LABELS[status]}
        </span>
      </div>

      {dragging && (
        <p className="mt-3 rounded-2xl bg-blush-wash px-4 py-3 text-[0.95rem] leading-relaxed text-ink">
          <span className="font-semibold">Pulling it down:</span> {dragging.label.toLowerCase()} —{" "}
          {dragging.summary.toLowerCase()}.
        </p>
      )}

      <dl className="mt-4 space-y-2">
        {shown.map((factor) => (
          // The summary keeps to its own side when it wraps: a factor line
          // that wraps and then left-aligns reads as a second factor.
          <div key={factor.id} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[0.95rem] text-ink">{factor.label}</dt>
            <dd className="min-w-0 text-right text-sm text-mauve">{factor.summary}</dd>
          </div>
        ))}
      </dl>

      {recommendation && (
        <p className="mt-4 border-t border-blush pt-4 text-[0.95rem] leading-relaxed text-ink">
          <span className="font-semibold">Vezri recommends:</span> {recommendation}
        </p>
      )}

      <p className="mt-4 border-t border-blush pt-3 text-xs leading-relaxed text-mauve-light">
        The score is worked out from your milestones, dates and check-ins. Vezri can explain it,
        never choose it.
      </p>
    </section>
  );
}
