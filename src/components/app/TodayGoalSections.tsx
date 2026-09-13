"use client";

import Link from "next/link";
import { useState } from "react";
import TaskActions, { type CheckInState } from "./TaskActions";
import TaskGuidance from "./TaskGuidance";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import StuckPanel from "@/components/coach/StuckPanel";
import Icon, { type IconName } from "@/components/icons/Icon";
import { CHECKIN_CONFIRMATION_AWAY } from "@/lib/app-copy";
import type { UrgencyKind } from "@/lib/plan/goal-today";
import { goalPath } from "@/lib/routes";

/**
 * §4.5 applied to the SCREEN. "Three important things beat 30 tasks."
 *
 * The cap used to be applied per goal, with an accordion around each section
 * and a "Show 9 more" under it. Five goals then put fifteen rows in the
 * document and offered forty-five more — a task manager with headings on it,
 * which is the thing §4 exists to avoid. The cap is now three rows across the
 * whole page (lib/plan/goal-today's capTodaySections), spread across goals so
 * a second goal cannot drift unseen, and everything else is on the goals page.
 *
 * The accordion went with it, and so did the "2 overdue · 3 due today" pill on
 * each header. Both existed to make a long list survivable: a section had to
 * be closable, and a closed section had to say what was inside it. With three
 * rows on the page there is nothing to close, and a per-goal overdue count is
 * the wall this screen just removed, rebuilt one goal at a time.
 *
 * What a row expands into is now the useful thing: the steps for doing it.
 *
 * The urgency, the badge, the date and the order all come from
 * lib/plan/goal-today — the same module the goal page's own Today list uses,
 * so the two screens cannot describe the same task differently.
 */

export type TodayTaskView = {
  id: string;
  title: string;
  /** One line of context — why this matters. */
  reason: string;
  /** "30 days overdue", "Due today". Uppercased by CSS, not in the string. */
  badge: string;
  urgency: UrgencyKind;
  /** "Due 10 Aug" or "Start by 1 Sept". Resolved in the user's zone server-side. */
  dateLabel: string | null;
  estimatedMinutes: number | null;
  milestoneTitle: string | null;
  reminderId: string | null;
};

export type TodaySectionView = {
  goalId: string;
  goalLabel: string;
  icon: IconName;
  tasks: TodayTaskView[];
};

/**
 * How each kind of attention looks.
 *
 * §4.6 forbids guilt, and the mockup's overdue treatment — a saturated red
 * disc with an exclamation mark — is the visual form of a telling-off however
 * neutrally the words beside it are written. Two things change and nothing
 * else does: the disc keeps its size, position and two-tier distinction but is
 * filled with the palette's own tints rather than an alarm red, and the glyph
 * is a clock rather than an exclamation. A clock says time has passed, which
 * is the fact. An exclamation mark says you should feel something about it.
 */
const TONE: Record<UrgencyKind, { chip: string; badge: string; date: string; icon: IconName }> = {
  overdue: {
    chip: "bg-blush-light text-berry",
    badge: "bg-blush-light text-berry",
    date: "text-berry",
    icon: "history",
  },
  due_today: {
    chip: "bg-cream text-mauve",
    badge: "bg-cream text-ink",
    date: "text-ink",
    icon: "clock",
  },
  start_overdue: {
    chip: "bg-blush-light text-mauve",
    badge: "bg-blush-light text-mauve",
    date: "text-mauve",
    icon: "history",
  },
  start_today: {
    chip: "bg-cream-light text-mauve",
    badge: "bg-cream-light text-mauve",
    date: "text-mauve",
    icon: "flag",
  },
};

/** Which panel a row has open, and why it opened. */
type OpenCoach = { taskId: string; state: "not_done" | "stuck" };

export default function TodayGoalSections({ sections }: { sections: TodaySectionView[] }) {
  const [coach, setCoach] = useState<OpenCoach | null>(null);
  // Screen-level, not row-level: the row a check-in describes leaves the list
  // on the refresh that follows, taking any message inside it along.
  const [recorded, setRecorded] = useState<CheckInState | null>(null);

  if (sections.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
        Nothing needs you today. That&rsquo;s a good place to be.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Announced without stealing focus, and it stays until the next
          check-in: a confirmation that times out is one a slow reader never
          sees. */}
      {recorded && recorded !== "waiting_on_someone" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl bg-blush-light px-4 py-3 text-[0.95rem] font-medium text-berry"
        >
          <Icon name="check" className="mt-0.5 h-4 w-4" />
          {CHECKIN_CONFIRMATION_AWAY[recorded]}
        </p>
      )}

      {sections.map((section) => (
        <section
          key={section.goalId}
          aria-labelledby={`today-goal-${section.goalId}`}
          /* No overflow-hidden. It was here to clip children to the rounded
             corners, and it is also the one ancestor able to clamp the panel
             that opens INSIDE this box — the steps, and §13's coach, both of
             which are taller than everything else on the screen. Corner
             rounding is worth a class on the header; it is not worth a clip
             that can silently swallow the core interaction. */
          className="rounded-2xl border border-blush bg-white shadow-soft"
        >
          {/* A heading, not a button. There is nothing to collapse now that
              the whole page holds three rows, and a control that hides the
              only task on the screen is worse than no control. */}
          <h3
            id={`today-goal-${section.goalId}`}
            className="flex items-center gap-3 px-4 py-4 sm:px-5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush-light text-berry">
              <Icon name={section.icon} />
            </span>
            {/* Wraps rather than truncating. A name that has to be cut to fit
                is a name that should not have been this long — goalLabel
                guarantees a short one — and CSS truncation is how "By Dec 31,
                2026, turn Caly…" reached the screen. */}
            <span className="min-w-0 text-[1.05rem] font-semibold leading-snug text-ink">
              {section.goalLabel}
            </span>
          </h3>

          <div className="border-t border-blush">
            <ul className="divide-y divide-blush/70">
              {section.tasks.map((task) => {
                const tone = TONE[task.urgency];
                const open = coach?.taskId === task.id ? coach : null;
                return (
                  <li key={task.id} className="px-4 py-4 sm:px-5">
                    <div className="flex gap-3.5">
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.chip}`}
                      >
                        <Icon name={tone.icon} className="h-[1.15rem] w-[1.15rem]" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                          <div className="min-w-0">
                            {/* uppercase is styling. The string stays a
                                sentence so a screen reader reads it as one. */}
                            <span
                              className={`inline-block rounded-pill px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${tone.badge}`}
                            >
                              {task.badge}
                            </span>
                            <h4 className="mt-1.5 font-semibold leading-snug text-ink">
                              {task.title}
                            </h4>
                            <p className="mt-0.5 text-sm leading-relaxed text-mauve">
                              {task.reason}
                            </p>
                            {(task.milestoneTitle || task.estimatedMinutes) && (
                              <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-sm text-mauve-light">
                                {task.milestoneTitle && <span>{task.milestoneTitle}</span>}
                                {task.milestoneTitle && task.estimatedMinutes && (
                                  <span aria-hidden="true">·</span>
                                )}
                                {task.estimatedMinutes && <span>~{task.estimatedMinutes} min</span>}
                              </p>
                            )}
                          </div>

                          {task.dateLabel && (
                            <p
                              className={`flex shrink-0 items-center gap-1.5 text-sm font-semibold ${tone.date}`}
                            >
                              <Icon name="calendar" className="h-4 w-4" />
                              {task.dateLabel}
                            </p>
                          )}
                        </div>

                        {/* The card expands into how to do the thing. It is
                            above the check-in buttons on purpose: a row that
                            asks "did you do it?" before it has said how is the
                            arrangement this replaces. */}
                        {!open && <TaskGuidance taskId={task.id} />}

                        {/* The buttons sit right on a wide screen; a panel
                            does not. Pushing a full coach panel into a
                            right-aligned flex child squeezes it to its
                            content width and wraps every sentence in it. */}
                        <div className={open ? "mt-3" : "mt-3 sm:flex sm:justify-end"}>
                          {open?.state === "stuck" ? (
                            <StuckPanel
                              taskId={task.id}
                              taskTitle={task.title}
                              onDone={() => setCoach(null)}
                            />
                          ) : open?.state === "not_done" ? (
                            <ExecutionBlockCoach
                              taskId={task.id}
                              taskTitle={task.title}
                              onDone={() => setCoach(null)}
                            />
                          ) : (
                            <TaskActions
                              taskId={task.id}
                              reminderId={task.reminderId}
                              onNeedsCoach={(taskId, state) => setCoach({ taskId, state })}
                              onRecorded={setRecorded}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* The rest of this goal's work, where the whole plan already is.
                No count: "Show 9 more" was the overdue wall per goal. */}
            <p className="border-t border-blush px-4 py-3 sm:px-5">
              <Link
                href={goalPath(section.goalId)}
                className="text-sm font-medium text-berry hover:underline"
              >
                Open {section.goalLabel}
              </Link>
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}
