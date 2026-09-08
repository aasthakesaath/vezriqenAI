import Icon from "@/components/icons/Icon";
import { HEALTH_LABELS } from "@/lib/app-copy";
import type { HealthFactor, HealthStatus } from "@/lib/health/score";

/**
 * How each status looks. Exported because My Goals shows the same pill beside
 * the same statuses, and two tables would drift.
 */
export const HEALTH_TONE: Record<HealthStatus, string> = {
  on_track: "bg-blush-light text-berry",
  needs_attention: "bg-cream text-mauve",
  at_risk: "bg-cream text-berry",
  off_track: "bg-blush-light text-berry-deep",
  achieved: "bg-blush-light text-berry",
  insufficient_data: "bg-cream text-mauve",
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
 *
 * Two things it must never blur:
 *
 *   * A COUNTED factor and an ABSTAINING one are different facts. "Nothing
 *     overdue" and "no dated tasks, so nothing CAN be overdue" read alike and
 *     mean opposite things, so they are separated and labelled here rather
 *     than left for the reader to infer from the wording.
 *   * A withheld score is not a low score. When too few factors have anything
 *     to measure there is no number at all — the card says so and names what
 *     would produce one, instead of averaging silence into a grade.
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
  /** 0–100 and deterministic, or null when there was not enough to judge. */
  score: number | null;
  status: HealthStatus;
  factors: HealthFactor[];
  /** The factor doing the most damage, for the plain-language line. */
  weakest?: HealthFactor | null;
  recommendation?: string | null;
}) {
  const counted = factors.filter((f) => f.weight > 0);
  const silent = factors.filter((f) => f.weight === 0 && f.absent);
  const withheld = score === null || status === "insufficient_data";

  // Only worth naming when it is actually pulling the score down; at 1 the
  // factor is healthy and "what's dragging it down: nothing" is noise.
  const dragging = !withheld && weakest && weakest.value < 0.95 ? weakest : null;

  const silentList = (
    <ul className="mt-2 space-y-1.5 text-sm text-mauve">
      {silent.map((factor) => (
        <li key={factor.id} className="flex flex-wrap gap-x-1.5">
          <span className="text-ink">{factor.label}:</span>
          <span className="min-w-0">{factor.absent}</span>
        </li>
      ))}
    </ul>
  );

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
        {/* No placeholder score, ever. A number here would be the whole bug. */}
        {!withheld && (
          <p className="text-3xl font-bold tracking-tight text-ink">
            {score}
            <span className="ml-1 text-base font-medium text-mauve-light">/ 100</span>
          </p>
        )}
        <span className={`rounded-pill px-3 py-1 text-sm font-semibold ${HEALTH_TONE[status]}`}>
          {HEALTH_LABELS[status]}
        </span>
      </div>

      {withheld ? (
        <>
          <p className="mt-3 rounded-2xl bg-blush-wash px-4 py-3 text-[0.95rem] leading-relaxed text-ink">
            {counted.length === 0
              ? "There is nothing here Vezri can measure yet, so there is no score to give."
              : `Only ${counted.length === 1 ? "one thing" : `${counted.length} things`} can be measured so far. A score built on that would say more than Vezri knows.`}
          </p>

          {counted.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-ink">What Vezri can see</h3>
              <dl className="mt-2 space-y-2">
                {counted.map((factor) => (
                  <div key={factor.id} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-[0.95rem] text-ink">{factor.label}</dt>
                    <dd className="min-w-0 text-right text-sm text-mauve">{factor.summary}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          <h3 className="mt-4 text-sm font-semibold text-ink">What would give Vezri a score</h3>
          {silentList}
        </>
      ) : (
        <>
          {dragging && (
            <p className="mt-3 rounded-2xl bg-blush-wash px-4 py-3 text-[0.95rem] leading-relaxed text-ink">
              <span className="font-semibold">Pulling it down:</span> {dragging.label.toLowerCase()}{" "}
              — {dragging.summary.toLowerCase()}.
            </p>
          )}

          <h3 className="mt-4 text-sm font-semibold text-ink">Counted</h3>
          <dl className="mt-2 space-y-2">
            {counted.map((factor) => (
              // The summary keeps to its own side when it wraps: a factor line
              // that wraps and then left-aligns reads as a second factor.
              <div key={factor.id} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-[0.95rem] text-ink">{factor.label}</dt>
                <dd className="min-w-0 text-right text-sm text-mauve">{factor.summary}</dd>
              </div>
            ))}
          </dl>

          {silent.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-ink">
                Not counted — nothing to measure yet
              </h3>
              {silentList}
            </>
          )}
        </>
      )}

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
