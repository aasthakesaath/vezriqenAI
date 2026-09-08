import Icon from "@/components/icons/Icon";
import AuditPanel from "@/components/app/AuditPanel";
import { formatDayKey } from "@/lib/time";

/**
 * The step-back view: how far along, what is coming, who is being waited on.
 *
 * Deliberately NOT the whole plan. §18 asks a goal page for progress by
 * milestone, critical dates, active dependencies and the audit — and all four
 * fit without listing thirty-four rows, which is what the Full Plan tab is
 * for. Success measures stay behind "Show full target" with the statement they
 * belong to, rather than being said twice on one screen.
 */
export default function GoalOverview({
  goalId,
  done,
  total,
  criticalDates,
  waitingOn,
}: {
  goalId: string;
  done: number;
  total: number;
  /** The next few dated milestones. A preview, never the full list. */
  criticalDates: Array<{ id: string; title: string; targetDate: string }>;
  /** Open work blocked on a named person (§13). */
  waitingOn: Array<{ id: string; title: string; person: string | null }>;
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="progress-heading"
        className="rounded-3xl border border-blush bg-white p-5 shadow-soft sm:p-6"
      >
        <h2 id="progress-heading" className="text-xl font-bold text-ink sm:text-2xl">
          Progress
        </h2>
        <p className="mt-1 text-mauve">
          {total === 0
            ? "No milestones on this goal yet."
            : `${done} of ${total} milestones complete`}
        </p>
        {total > 0 && (
          // Decorative: the sentence above already states the same numbers, so
          // the bar carries no role and nothing depends on reading it.
          <div aria-hidden="true" className="mt-3 h-2 w-full rounded-pill bg-blush-light">
            <div className="h-2 rounded-pill bg-berry" style={{ width: `${percent}%` }} />
          </div>
        )}
      </section>

      {criticalDates.length > 0 && (
        <section
          aria-labelledby="dates-heading"
          className="rounded-3xl border border-blush bg-white p-5 shadow-soft sm:p-6"
        >
          <h2 id="dates-heading" className="text-xl font-bold text-ink sm:text-2xl">
            Critical dates
          </h2>
          <ul className="mt-3 space-y-2">
            {criticalDates.map((milestone) => (
              <li key={milestone.id} className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="min-w-0 text-ink">{milestone.title}</span>
                <span className="flex items-center gap-1.5 text-sm text-mauve">
                  <Icon name="calendar" className="h-4 w-4" />
                  {formatDayKey(milestone.targetDate)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {waitingOn.length > 0 && (
        <section
          aria-labelledby="waiting-heading"
          className="rounded-3xl border border-blush bg-white p-5 shadow-soft sm:p-6"
        >
          <h2 id="waiting-heading" className="text-xl font-bold text-ink sm:text-2xl">
            Waiting on someone else
          </h2>
          <p className="mt-1 text-sm text-mauve">
            Work Vezri keeps visible without letting it take a slot in your day.
          </p>
          <ul className="mt-3 space-y-2">
            {waitingOn.map((task) => (
              <li key={task.id} className="rounded-2xl bg-blush-wash px-4 py-3">
                <p className="font-medium text-ink">{task.title}</p>
                {task.person && (
                  // §3 — a name. No invitation and no account for that person.
                  <p className="mt-0.5 text-sm text-mauve">
                    <span className="font-medium">Waiting on:</span> {task.person}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AuditPanel goalId={goalId} />
    </div>
  );
}
