import Link from "next/link";
import Icon from "@/components/icons/Icon";
import MilestoneDate from "@/components/plan/MilestoneDate";
import { goalTabPath } from "@/lib/plan/goal-tabs";
import { formatDayKey } from "@/lib/time";

/**
 * The one milestone that comes next.
 *
 * Not a list — the full list is the Full Plan tab, and repeating it here is
 * what made the old page scroll past thirty-four rows to reach three tasks.
 *
 * A milestone with no date says so and offers to add one. Seventeen of
 * thirty-four in a real plan came back undated, because the document anchored
 * them to an event rather than a day; §9's lead-time engine has nothing to
 * work with until a date exists, so a blank space is a dead end where a
 * single click should be.
 */
export default function NextMilestoneCard({
  goalId,
  milestone,
  done,
  total,
}: {
  goalId: string;
  milestone: {
    id: string;
    title: string;
    targetDate: string | null;
    dateAnchor: string | null;
  } | null;
  done: number;
  total: number;
}) {
  return (
    <section
      aria-labelledby="next-milestone-heading"
      className="rounded-3xl border border-blush bg-white p-5 shadow-soft"
    >
      <h2
        id="next-milestone-heading"
        className="flex items-center gap-2 text-lg font-semibold text-ink"
      >
        <Icon name="flag" className="h-5 w-5 text-berry" />
        Next Milestone
      </h2>

      {milestone ? (
        <>
          <p className="mt-3 font-semibold leading-snug text-ink">{milestone.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-mauve">
            <Icon name="calendar" className="h-4 w-4" />
            <span>Target:</span>
            <MilestoneDate
              milestoneId={milestone.id}
              date={milestone.targetDate}
              label={formatDayKey(milestone.targetDate) || null}
              dateAnchor={milestone.dateAnchor}
            />
          </div>

          <Link
            href={`${goalTabPath(goalId, "plan")}#milestone-${milestone.id}`}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-berry hover:underline"
          >
            See it in the full plan
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </>
      ) : (
        <p className="mt-3 text-mauve">
          {total > 0
            ? "Every milestone on this goal is done."
            : "This goal has no milestones yet."}
        </p>
      )}

      {total > 0 && (
        <p className="mt-4 border-t border-blush pt-3 text-sm text-mauve-light">
          {done} of {total} milestones complete
        </p>
      )}
    </section>
  );
}
