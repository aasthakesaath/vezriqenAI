import Link from "next/link";
import { HEALTH_TONE } from "./HealthCard";
import ProgressRing from "./ProgressRing";
import VezriNote from "./VezriNote";
import { VezriPoseImage } from "@/components/VezriWorking";
import GoalIcon, { type GoalIconName } from "@/lib/goal-icons";
import { HEALTH_LABELS } from "@/lib/app-copy";
import type { HealthStatus } from "@/lib/health/score";
import type { GoalTaskCounts } from "@/lib/plan/goal-progress";
import { APP_ROUTES, goalPath } from "@/lib/routes";

/**
 * Everything /goals draws, with no database in it. See TodayScreen for why.
 */

export type GoalCardView = {
  id: string;
  /** The six-word label, never the SMART statement. */
  label: string;
  /** One line, or nothing. Never a clause cut off mid-thought. */
  summary: string | null;
  icon: GoalIconName;
  health: HealthStatus | null;
  targetDate: string | null;
  nextMilestone: string | null;
  counts: GoalTaskCounts;
};

const svg = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": "true" as const,
  focusable: "false" as const,
  className: "h-4 w-4 shrink-0",
};

export default function GoalsScreen({ goals }: { goals: GoalCardView[] }) {
  return (
    <div className="shell max-w-3xl py-10 lg:py-14">
      <div className="flex items-start justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">My Goals</h1>
          <p className="mt-2 text-[1.02rem] text-mauve">
            Your goals, their progress, and what each one needs next.
          </p>
        </div>
        <VezriNote note={"Big goals. Brighter futures. Let’s make it happen."} />
      </div>

      {goals.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <VezriPoseImage pose="reading" alt="" className="h-20 w-auto shrink-0" />
            <p className="text-mauve">
              No goals yet. Bring Vezri a plan and it becomes something you can follow.
            </p>
          </div>
          <Link href={APP_ROUTES.start} className="btn-primary mt-5">
            Bring Vezri a plan
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-8 space-y-4">
            {goals.map((goal) => (
              <li key={goal.id}>
                {/* The whole card is the link, and there is nothing clickable
                    inside it: a control nested in a link is not reachable by
                    keyboard in the order it looks like it is in. */}
                <Link
                  href={goalPath(goal.id)}
                  className="block rounded-2xl border border-blush bg-white p-5 shadow-soft transition-colors hover:bg-blush-wash sm:p-6"
                >
                  <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blush-light text-berry"
                    >
                      <GoalIcon name={goal.icon} className="h-5 w-5" />
                    </span>

                    <div className="min-w-0 flex-1 basis-48">
                      <h2 className="text-[1.15rem] font-bold leading-snug text-ink">
                        {goal.label}
                      </h2>
                      {goal.summary && (
                        <p className="mt-1 text-[0.95rem] leading-relaxed text-mauve">
                          {goal.summary}
                        </p>
                      )}
                    </div>

                    {/* Says what it counts, right under the number — §15 keeps
                        "tasks complete" and "how the goal is doing" apart. */}
                    <ProgressRing percent={goal.counts.percentComplete} className="shrink-0" />

                    <div className="min-w-0 flex-1 basis-44 space-y-1.5">
                      {goal.health && (
                        <span
                          className={`inline-block rounded-pill px-3 py-1 text-sm font-semibold ${HEALTH_TONE[goal.health]}`}
                        >
                          {HEALTH_LABELS[goal.health]}
                        </span>
                      )}
                      {goal.targetDate && (
                        <p className="text-sm text-mauve">Target: {goal.targetDate}</p>
                      )}
                      {goal.nextMilestone && (
                        <p className="text-sm text-mauve">
                          <span className="font-medium text-ink">Next milestone:</span>{" "}
                          {goal.nextMilestone}
                        </p>
                      )}
                    </div>

                    <svg
                      viewBox="0 0 24 24"
                      {...svg}
                      className="hidden h-5 w-5 shrink-0 self-center text-berry sm:block"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {goal.counts.total > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-blush pt-3 text-sm text-mauve">
                      <span className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" {...svg}>
                          <path d="M8.4 6.4h11.2M8.4 12h11.2M8.4 17.6h11.2M4.4 6.4h.01M4.4 12h.01M4.4 17.6h.01" />
                        </svg>
                        {goal.counts.total} total {goal.counts.total === 1 ? "task" : "tasks"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" {...svg}>
                          <path d="M3.4 9.2A9 9 0 1 1 3 12" />
                          <path d="M3.1 4.6v4.6h4.6" />
                          <path d="M12 7.8V12l2.8 1.7" />
                        </svg>
                        {goal.counts.overdue} overdue
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" {...svg}>
                          <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.4" />
                          <path d="M3.4 10h17.2M8.2 3.4v3.6M15.8 3.4v3.6" />
                        </svg>
                        {goal.counts.dueThisWeek} due this week
                      </span>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href={APP_ROUTES.start}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-blush bg-blush-wash px-5 py-4 text-[0.98rem] font-semibold text-berry transition-colors hover:bg-blush-light"
          >
            <svg viewBox="0 0 24 24" {...svg} className="h-5 w-5 shrink-0">
              <path d="M12 5.4v13.2M5.4 12h13.2" />
            </svg>
            Add a new goal
          </Link>
        </>
      )}
    </div>
  );
}
