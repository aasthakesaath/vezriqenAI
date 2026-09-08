import Icon from "@/components/icons/Icon";
import MilestoneDate from "@/components/plan/MilestoneDate";
import ProvenanceBadge from "@/components/plan/ProvenanceBadge";
import { formatDayKey } from "@/lib/time";

export type PlanTaskRow = {
  id: string;
  title: string;
  status: string;
  startBy: string | null;
  deadline: string | null;
  estimatedMinutes: number | null;
  origin: "explicit" | "inferred";
  confidence: number;
};

export type PlanMilestoneRow = {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  dateAnchor: string | null;
  tasks: PlanTaskRow[];
};

/**
 * Every milestone, in plan order. The ONE place the whole list is rendered.
 *
 * It used to be rendered twice: once here and again in a "Progress" section on
 * the same page, under a view already scoped to a single day. Thirty-four
 * milestones repeated below three tasks is not more information, it is the
 * same information in the way of the work.
 *
 * Each milestone carries an id so the Next Milestone card can link straight to
 * it, and `scroll-mt` keeps it clear of the sticky header when it lands.
 */
export default function FullPlan({
  milestones,
  looseTasks,
}: {
  milestones: PlanMilestoneRow[];
  /** Tasks that belong to no milestone. Real, and otherwise invisible. */
  looseTasks: PlanTaskRow[];
}) {
  if (milestones.length === 0 && looseTasks.length === 0) {
    return (
      <p className="rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
        This goal has no plan yet.
      </p>
    );
  }

  return (
    <section aria-labelledby="plan-heading" className="space-y-3">
      <h2 id="plan-heading" className="text-xl font-bold text-ink sm:text-2xl">
        Full plan
      </h2>
      <p className="text-sm text-mauve">
        Every milestone on this goal, in the order the plan runs them.
      </p>

      <ul className="space-y-3 pt-2">
        {milestones.map((milestone) => {
          const done = milestone.tasks.filter((t) => t.status === "done").length;
          return (
            <li
              key={milestone.id}
              id={`milestone-${milestone.id}`}
              className="scroll-mt-28 rounded-2xl border border-blush bg-white p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <h3 className="flex min-w-0 items-start gap-2 font-semibold text-ink">
                  <Icon
                    name={milestone.status === "done" ? "check" : "flag"}
                    className="mt-0.5 h-5 w-5 text-mauve-light"
                  />
                  <span className={milestone.status === "done" ? "text-mauve-light" : ""}>
                    {milestone.title}
                  </span>
                </h3>
                {/* Undated milestones say so and offer a date rather than
                    sitting blank — nothing can be scheduled around a milestone
                    with no day. */}
                <MilestoneDate
                  milestoneId={milestone.id}
                  date={milestone.targetDate}
                  label={formatDayKey(milestone.targetDate) || null}
                  dateAnchor={milestone.dateAnchor}
                />
              </div>

              {milestone.tasks.length > 0 && (
                <>
                  <p className="mt-1 pl-7 text-sm text-mauve">
                    {done} of {milestone.tasks.length} tasks done
                  </p>
                  <TaskLines tasks={milestone.tasks} />
                </>
              )}
            </li>
          );
        })}

        {looseTasks.length > 0 && (
          <li className="rounded-2xl border border-blush bg-white p-5 shadow-soft">
            <h3 className="font-semibold text-ink">Not under a milestone</h3>
            <TaskLines tasks={looseTasks} />
          </li>
        )}
      </ul>
    </section>
  );
}

function TaskLines({ tasks }: { tasks: PlanTaskRow[] }) {
  return (
    <ul className="mt-3 space-y-2 border-t border-blush pt-3">
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={`min-w-0 flex-1 text-[0.95rem] ${
              task.status === "done" ? "text-mauve-light line-through" : "text-ink"
            }`}
          >
            {task.title}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mauve-light">
            {task.estimatedMinutes && <span>~{task.estimatedMinutes} min</span>}
            {task.startBy && <span>Start by {formatDayKey(task.startBy)}</span>}
            {task.deadline && <span>Due {formatDayKey(task.deadline)}</span>}
            <ProvenanceBadge origin={task.origin} confidence={task.confidence} />
          </span>
        </li>
      ))}
    </ul>
  );
}
