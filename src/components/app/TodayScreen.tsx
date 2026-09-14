import Link from "next/link";
import StartFromToday from "./StartFromToday";
import TodayTasks, { type TodayTaskView } from "./TodayTasks";
import VezriNote from "./VezriNote";
import { APP_ROUTES } from "@/lib/routes";

/**
 * Everything /today draws, with no database in it.
 *
 * Split out from the route so the screen can be rendered — and put through
 * axe at 375px and 1440px — without a signed-in session. The page above stays
 * what it should be: a query and a mapping.
 *
 * WHAT CHANGED, AND WHY IT IS SMALLER. This screen used to open with
 * "{n} things are past the date Vezri worked back to" and then draw one
 * collapsible section per goal, three rows in each. With four goals that is
 * twelve rows under a headline count of thirty-three, which is a backlog with
 * a scoreboard on it — the two things §4.5 and §4.6 each rule out on their
 * own. The count is gone entirely, the day is three cards, and everything else
 * is on /goals, which already lists it properly.
 */

export type WaitingOnView = {
  id: string;
  title: string;
  /** The person's name. §3 keeps it to a name: no invitation, no account. */
  waitingOn: string | null;
  goalLabel: string;
};

/** §13 rows are informational; the page stays small at three of them too. */
const WAITING_ON_LIMIT = 3;

export default function TodayScreen({
  dateLabel,
  greeting,
  firstName,
  hasGoals,
  planBehind,
  tasks,
  waitingOn,
}: {
  dateLabel: string;
  /** "Good evening" — on the reader's clock, not the server's. */
  greeting: string;
  firstName: string | null;
  hasGoals: boolean;
  /**
   * True when at least one open task's own date has passed. A BOOLEAN, not a
   * count: the number is what made this a wall, and nothing on the screen
   * needs to know it. It only decides whether the one line and the one button
   * are drawn.
   */
  planBehind: boolean;
  tasks: TodayTaskView[];
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

        {/* §4.6 — encouragement, and never an exclamation on a day carrying
            work that slipped. "That happens" is the product's whole posture
            towards a missed date. */}
        <VezriNote
          note={
            planBehind
              ? "Some of this slipped. Picking up one thing is a real start."
              : "Small steps today make big progress."
          }
        />
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
          {/* One line, one button, no number. See StartFromToday. */}
          {planBehind && <StartFromToday />}

          <TodayTasks tasks={tasks} />

          {/* §13 — work that isn't in the user's control, kept visible but out
              of the priority slots. */}
          {waitingOn.length > 0 && (
            <section aria-labelledby="waiting-heading" className="mt-10">
              <h2 id="waiting-heading" className="text-lg font-semibold text-ink">
                Waiting on someone else
              </h2>
              <ul className="mt-3 space-y-2">
                {waitingOn.slice(0, WAITING_ON_LIMIT).map((task) => (
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

          {/* Where the rest of the work is. Not an apology for hiding it —
              /goals lists every goal with its own full plan, and it is the
              screen built for reading a backlog. */}
          <p className="mt-10">
            <Link href={APP_ROUTES.goals} className="btn-secondary">
              See all your goals
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
