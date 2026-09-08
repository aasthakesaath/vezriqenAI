import Link from "next/link";
import Icon from "@/components/icons/Icon";
import { VezriPoseImage } from "@/components/VezriWorking";
import { POSE_FOR } from "@/lib/vezri-poses";
import { GOAL_ENCOURAGEMENT } from "@/lib/app-copy";
import { APP_ROUTES } from "@/lib/routes";
import { formatDayKeyYear } from "@/lib/time";

/**
 * The top of a goal page.
 *
 * The heading is the SHORT LABEL and nothing else. It used to be the SMART
 * statement, clipped by CSS, which rendered as "By Dec 31, 2026, turn Caly…" —
 * a heading cut mid-word, and the name of the goal nowhere on the page. The
 * statement is still one tap away in "Show full target", which is what §6
 * requires: the thing the user approved is preserved, it is simply not
 * pretending to be a title.
 *
 * Back goes to My Goals. A goal belongs to the list of goals; Today is a
 * cross-goal screen, and sending someone there from inside one goal loses
 * where they were.
 */
export default function GoalHeader({
  label,
  summary,
  targetDate,
  achieved,
  children,
}: {
  label: string;
  /** One line about the goal. Never the whole statement — see goalSummary. */
  summary: string;
  /** A calendar day, "YYYY-MM-DD", or null. */
  targetDate: string | null;
  achieved: boolean;
  /** The "Show full target" disclosure, rendered under the header block. */
  children?: React.ReactNode;
}) {
  return (
    <header className="rounded-3xl border border-blush bg-white px-5 py-6 shadow-soft sm:px-7">
      <Link
        href={APP_ROUTES.goals}
        className="inline-flex items-center gap-1 text-sm font-semibold text-berry hover:underline"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        Back to My Goals
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4 sm:gap-6">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {/* One icon set, never emoji — see components/icons/Icon.tsx. The
              trophy is earned: it appears once the goal is achieved, so it
              means something rather than decorating every goal alike. */}
          <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blush-light text-berry sm:h-12 sm:w-12">
            <Icon name={achieved ? "trophy" : "goal"} className="h-6 w-6" />
          </span>

          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:text-4xl">
              {label}
            </h1>
            {targetDate && (
              <p className="mt-1.5 flex items-center gap-1.5 text-mauve">
                <Icon name="calendar" className="h-4 w-4" />
                Target: {formatDayKeyYear(targetDate)}
              </p>
            )}
            {summary && (
              <p className="mt-2 max-w-2xl text-[0.98rem] leading-relaxed text-mauve">{summary}</p>
            )}
          </div>
        </div>

        {/* Vezri and one encouraging line. Hidden below sm: at 375px the
            header has to be the goal, not the mascot. */}
        <div className="hidden shrink-0 items-end gap-3 sm:flex">
          <p className="max-w-[11rem] rounded-2xl border border-blush bg-blush-wash px-4 py-3 text-sm leading-relaxed text-ink">
            {GOAL_ENCOURAGEMENT}
            <Icon name="heart" className="ml-1 inline-block h-4 w-4 text-rose" />
          </p>
          <VezriPoseImage pose={POSE_FOR.goalHealth} alt="" className="h-24 w-auto lg:h-28" />
        </div>
      </div>

      {children}
    </header>
  );
}
