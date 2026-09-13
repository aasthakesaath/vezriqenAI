import Link from "next/link";
import StartFromToday from "./StartFromToday";
import TodayGoalSections, { type TodaySectionView } from "./TodayGoalSections";
import VezriNote from "./VezriNote";
import { APP_ROUTES } from "@/lib/routes";

/**
 * Everything /today draws, with no database in it.
 *
 * Split out from the route so the screen can be rendered — and put through
 * axe at 375px and 1440px — without a signed-in session. The page above stays
 * what it should be: a query and a mapping.
 */

export type WaitingOnView = {
  id: string;
  title: string;
  /** The person's name. §3 keeps it to a name: no invitation, no account. */
  waitingOn: string | null;
  goalLabel: string;
};

export default function TodayScreen({
  dateLabel,
  greeting,
  firstName,
  hasGoals,
  hasOverdue,
  hasMore,
  sections,
  waitingOn,
}: {
  dateLabel: string;
  /** "Good evening" — on the reader's clock, not the server's. */
  greeting: string;
  firstName: string | null;
  hasGoals: boolean;
  /** True when something open is dated before today. Never a count. */
  hasOverdue: boolean;
  /** True when more needs attention than the three rows shown. */
  hasMore: boolean;
  sections: TodaySectionView[];
  waitingOn: WaitingOnView[];
}) {
  return (
    <div className="shell max-w-3xl py-10 lg:py-14">
      <div className="flex items-start justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          {/* Both the date and the greeting are resolved in the user's zone
              on the server, which is the whole point of lib/time-zone: the
              date is already a DayKey by the time it gets here, and there is
              nothing left for the client to correct. */}
          <p className="text-[0.95rem] font-medium text-mauve">{dateLabel}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Today</h1>
          <p className="mt-2 text-[1.02rem] text-mauve">
            {greeting}
            {firstName ? `, ${firstName}` : ""} &mdash; here&rsquo;s what needs your attention
            today.
          </p>
        </div>

        {/* §4.6 — encouragement about the work, never about the person's
            record. It said something different on a day carrying work that had
            slipped, which meant the screen commented on the slip twice: once
            in the banner and once here. The banner is gone and so is the
            variant. One line, the same every day. */}
        <VezriNote note="Small steps today make big progress." />
      </div>

      {!hasGoals ? (
        <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <p className="text-mauve">You don&rsquo;t have an active goal yet.</p>
          <Link href={APP_ROUTES.start} className="btn-primary mt-5">
            Bring Vezri a plan
          </Link>
        </div>
      ) : (
        <>
          {/* What used to be here: "33 things are past the date Vezri worked
              back to." A count nobody can act on, at the top of the screen, in
              a sentence that reads as an accusation however carefully it is
              worded — and the more behind you were, the larger the number that
              greeted you.

              One line and one button, and the line is about what the button
              does rather than about how far behind anything is. */}
          {hasOverdue && <StartFromToday />}

          <TodayGoalSections sections={sections} />

          {/* §13 — work that isn't in the user's control, kept visible but out
              of the priority slots. */}
          {waitingOn.length > 0 && (
            <section aria-labelledby="waiting-heading" className="mt-10">
              <h2 id="waiting-heading" className="text-lg font-semibold text-ink">
                Waiting on someone else
              </h2>
              <ul className="mt-3 space-y-2">
                {waitingOn.map((task) => (
                  <li key={task.id} className="rounded-xl border border-blush bg-white px-5 py-4">
                    <p className="font-medium text-ink">{task.title}</p>
                    {task.waitingOn && (
                      <p className="mt-0.5 text-sm text-mauve">
                        <span className="font-medium">Waiting on:</span> {task.waitingOn}
                      </p>
                    )}
                    <p className="mt-0.5 text-sm text-mauve-light">{task.goalLabel}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10">
            {/* Where the rest of it went. Said without a number, because "and
                30 more" is the overdue wall in a smaller font. */}
            {hasMore && (
              <p className="mb-3 text-[0.98rem] text-mauve">
                The rest of your plan is on your goals page, whenever you want it.
              </p>
            )}
            <Link href={APP_ROUTES.goals} className="btn-secondary">
              See all your goals
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
