import Icon from "@/components/icons/Icon";
import { formatDayKey } from "@/lib/time";
import type { PlanTaskRow } from "./FullPlan";

/**
 * The Week and Month views: what falls inside a rolling window.
 *
 * Rolled up from the milestone and task dates that already exist — no schedule
 * table, nothing new to keep in sync, and therefore nothing that can disagree
 * with the plan it was derived from.
 *
 * Unlike Today this is a WINDOW, not a selection: everything dated inside it
 * is here, in date order, because "what is coming up" is a question about
 * completeness rather than about priority.
 */
export default function ScopedPlan({
  window: label,
  milestones,
  tasks,
}: {
  window: "week" | "month";
  milestones: Array<{ id: string; title: string; targetDate: string | null; done: number; total: number }>;
  tasks: PlanTaskRow[];
}) {
  if (milestones.length === 0 && tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
        Nothing falls in this {label} yet.
      </p>
    );
  }

  return (
    <section aria-labelledby="scoped-heading" className="space-y-3">
      <h2 id="scoped-heading" className="text-xl font-bold text-ink sm:text-2xl">
        {label === "week" ? "The next seven days" : "The next month"}
      </h2>

      {milestones.length > 0 && (
        <ul className="space-y-3 pt-1">
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className="rounded-2xl border border-blush bg-white p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold text-ink">
                  <Icon name="flag" className="h-5 w-5 text-mauve-light" />
                  {milestone.title}
                </h3>
                <span className="text-sm text-mauve-light">
                  {milestone.targetDate ? formatDayKey(milestone.targetDate) : "No date yet"}
                </span>
              </div>
              {milestone.total > 0 && (
                <p className="mt-1 pl-7 text-sm text-mauve">
                  {milestone.done} of {milestone.total} tasks done
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <ul className="space-y-2 pt-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-2xl border border-blush bg-white px-5 py-4 shadow-soft"
            >
              <p className="font-medium text-ink">{task.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mauve-light">
                {task.estimatedMinutes && <span>~{task.estimatedMinutes} min</span>}
                {task.startBy && <span>Start by {formatDayKey(task.startBy)}</span>}
                {task.deadline && <span>Due {formatDayKey(task.deadline)}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
