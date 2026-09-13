"use client";

import Link from "next/link";
import { useState } from "react";
import TaskActions, { type CheckInState, type CoachRequest } from "./TaskActions";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import StuckPanel from "@/components/coach/StuckPanel";
import TaskGuidance from "@/components/coach/TaskGuidance";
import Icon, { type IconName } from "@/components/icons/Icon";
import { CHECKIN_CONFIRMATION_AWAY } from "@/lib/app-copy";
import type { UrgencyKind } from "@/lib/plan/goal-today";
import { goalPath } from "@/lib/routes";

/**
 * The day's work: three cards, and nothing behind a "show more".
 *
 * This replaced a per-goal accordion. That version capped each SECTION at
 * three rows and left the number of sections open, so a person with four goals
 * opened /today to twelve rows under a line reading "33 things are past the
 * date Vezri worked back to" — a page that is a backlog with a headline count
 * on it, which is exactly what §4.5 ("three important things beat 30 tasks")
 * and §4.6 ("no guilt") each rule out on their own.
 *
 * So: three cards, chosen across every goal by the same urgency engine the
 * goal page uses (lib/plan/goal-today), each naming the goal it belongs to.
 * Everything else is on /goals, which already lists it properly — the link at
 * the bottom is not an apology for hiding work, it is where the work lives.
 *
 * A card EXPANDS. Collapsed it says what the task is and offers the three
 * check-in responses; expanded it asks /api/tasks/[id]/guidance how to do the
 * thing. That question used to have no answer anywhere in the product until
 * after the work had already been missed.
 */

export type TodayTaskView = {
  id: string;
  title: string;
  /** One line of context — why this matters. Already a finished sentence. */
  reason: string;
  /** "30 days overdue", "Due today". Uppercased by CSS, not in the string. */
  badge: string;
  urgency: UrgencyKind;
  /** "Due 10 Aug" or "Start by 1 Sept". Resolved in the user's zone server-side. */
  dateLabel: string | null;
  estimatedMinutes: number | null;
  milestoneTitle: string | null;
  reminderId: string | null;
  goalId: string;
  /** The six-word name, resolved by lib/goal-label before it got here. */
  goalLabel: string;
  icon: IconName;
};

/**
 * How each kind of attention looks.
 *
 * §4.6 forbids guilt, and a saturated red disc with an exclamation mark is the
 * visual form of a telling-off however neutrally the words beside it read. The
 * disc keeps its size and its two-tier distinction, filled with the palette's
 * own tints; the glyph is a clock. A clock says time has passed, which is the
 * fact. An exclamation mark says you should feel something about it.
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

export default function TodayTasks({ tasks }: { tasks: TodayTaskView[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [coach, setCoach] = useState<CoachRequest | null>(null);
  // Screen-level, not row-level: the row a check-in describes leaves the list
  // on the refresh that follows, taking any message inside it along.
  const [recorded, setRecorded] = useState<CheckInState | null>(null);

  if (tasks.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
        Nothing needs you today. That&rsquo;s a good place to be.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
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

      {tasks.map((task) => {
        const tone = TONE[task.urgency];
        const open = expanded === task.id;
        const panelId = `today-task-${task.id}`;
        const coaching = coach?.taskId === task.id ? coach : null;

        return (
          <article
            key={task.id}
            /* No overflow-hidden. It was here to clip children to the rounded
               corners, and it is also the one ancestor able to clamp the
               panels that open INSIDE this card — the guidance list and the
               Stuck panel are both taller than everything else on the screen.
               Corner rounding is worth a class on the header button; it is not
               worth a clip that can silently swallow §13's core interaction. */
            className="rounded-2xl border border-blush bg-white shadow-soft"
          >
            <div className="flex gap-3.5 px-4 py-4 sm:px-5">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.chip}`}
              >
                <Icon name={tone.icon} className="h-[1.15rem] w-[1.15rem]" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    {/* uppercase is styling. The string stays a sentence so a
                        screen reader reads it as one. */}
                    <span
                      className={`inline-block rounded-pill px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${tone.badge}`}
                    >
                      {task.badge}
                    </span>
                    <h3 className="mt-1.5 font-semibold leading-snug text-ink">{task.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-mauve">{task.reason}</p>

                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-sm text-mauve-light">
                      {/* The goal is named on the CARD now that the sections
                          are gone. Wraps rather than truncating: a name that
                          has to be cut to fit is a name that should not have
                          been this long, and CSS truncation is how "By Dec 31,
                          2026, turn Caly…" reached the screen. */}
                      <span className="flex items-center gap-1.5 font-medium text-mauve">
                        <Icon name={task.icon} className="h-4 w-4" />
                        {task.goalLabel}
                      </span>
                      {task.milestoneTitle && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{task.milestoneTitle}</span>
                        </>
                      )}
                      {task.estimatedMinutes && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>~{task.estimatedMinutes} min</span>
                        </>
                      )}
                    </p>
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

                {/* A real <button> with aria-expanded and aria-controls: the
                    USWDS accordion pattern the rest of the product follows
                    (see Disclosure.tsx). */}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setExpanded(open ? null : task.id)}
                  className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-berry transition-colors hover:underline"
                >
                  {open ? "Hide the steps" : "How do I do this?"}
                  <span className={open ? "rotate-180" : ""}>
                    <Icon name="chevronDown" className="h-4 w-4" />
                  </span>
                </button>

                {/* `hidden` rather than unmounted, so in-page find still
                    reaches it — but the guidance component is only MOUNTED
                    once opened, because mounting it is what pays for the
                    model call. */}
                <div id={panelId} hidden={!open} className="mt-3">
                  {open && <TaskGuidance taskId={task.id} />}
                </div>

                <div className="mt-3 sm:flex sm:justify-end">
                  {coaching?.state === "stuck" ? (
                    <StuckPanel
                      taskId={task.id}
                      taskTitle={task.title}
                      checkInId={coaching.checkInId}
                      onDone={() => setCoach(null)}
                    />
                  ) : coaching?.state === "not_done" ? (
                    <ExecutionBlockCoach
                      taskId={task.id}
                      taskTitle={task.title}
                      checkInId={coaching.checkInId}
                      onDone={() => setCoach(null)}
                    />
                  ) : (
                    <TaskActions
                      taskId={task.id}
                      reminderId={task.reminderId}
                      onNeedsCoach={setCoach}
                      onRecorded={setRecorded}
                    />
                  )}
                </div>
              </div>
            </div>

            <p className="border-t border-blush px-4 py-2.5 sm:px-5">
              <Link
                href={goalPath(task.goalId)}
                className="text-sm font-medium text-berry hover:underline"
              >
                Open {task.goalLabel}
              </Link>
            </p>
          </article>
        );
      })}
    </div>
  );
}
