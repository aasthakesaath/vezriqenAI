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
};

/**
 * PRD §15 Goal Health card.
 *
 * Shows the factor breakdown, not just the headline, because a status without
 * its reasons is exactly the "percent of tasks completed" number §15 rejects.
 * The score comes from the deterministic calculation; only `recommendation` is
 * ever model-written.
 */
export default function HealthCard({
  title,
  status,
  factors,
  recommendation,
}: {
  title: string;
  status: HealthStatus;
  factors: HealthFactor[];
  recommendation?: string | null;
}) {
  const shown = factors.filter((f) => f.weight > 0);

  return (
    <section
      aria-labelledby="health-heading"
      className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="health-heading" className="text-lg font-semibold text-ink">
          {title}
        </h2>
        <span className={`rounded-pill px-3 py-1 text-sm font-semibold ${HEALTH_TONE[status]}`}>
          {HEALTH_LABELS[status]}
        </span>
      </div>

      <dl className="mt-5 space-y-2.5">
        {shown.map((factor) => (
          <div key={factor.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-[0.95rem] text-ink">{factor.label}</dt>
            <dd className="text-sm text-mauve">{factor.summary}</dd>
          </div>
        ))}
      </dl>

      {recommendation && (
        <p className="mt-5 border-t border-blush pt-4 text-[0.98rem] leading-relaxed text-ink">
          <span className="font-semibold">Vezri recommends:</span> {recommendation}
        </p>
      )}
    </section>
  );
}
