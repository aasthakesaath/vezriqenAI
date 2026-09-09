"use client";

import { useId, useState } from "react";
import Icon, { type IconName } from "@/components/icons/Icon";
import TaskActions, { type CheckInState } from "@/components/app/TaskActions";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import {
  CHECKIN_CONFIRMATION,
  GOAL_TODAY_EMPTY,
  GOAL_TODAY_HEADING,
  GOAL_TODAY_SUBTEXT,
} from "@/lib/app-copy";
import type { UrgencyKind } from "@/lib/plan/goal-today";

/**
 * One row's worth of already-decided facts.
 *
 * Which tasks belong to today, in what order, and what each badge says is
 * computed on the server by lib/plan/goal-today.ts — deterministically, from
 * stored dates. This component decides nothing about urgency; it renders it.
 */
export type GoalTaskView = {
  id: string;
  title: string;
  /** One line: why this matters. The model's sentence where it wrote one. */
  reason: string;
  urgencyKind: UrgencyKind;
  urgencyLabel: string;
  dateLabel: string;
  estimatedMinutes: number | null;
  milestoneTitle: string | null;
  waitingOn: string | null;
  /** The open checkpoint this task answers, so a check-in closes the loop. */
  reminderId: string | null;
};

/**
 * Informational, never alarming (§4.6).
 *
 * There is no red on this screen. A row that has slipped is drawn in the same
 * brand tones as everything else and says how many days it has been — the
 * fact does the work. Sirens are how a plan full of ordinary slippage starts
 * reading as a telling-off, and the point of the coach is that a slip is a
 * problem to solve rather than something to feel bad about.
 */
const URGENCY: Record<UrgencyKind, { icon: IconName; chip: string; badge: string }> = {
  overdue: {
    icon: "clock",
    chip: "bg-blush-light text-berry",
    badge: "bg-blush-light text-berry",
  },
  due_today: {
    icon: "calendar",
    chip: "bg-cream text-mauve",
    badge: "bg-cream text-mauve",
  },
  start_overdue: {
    icon: "clock",
    chip: "bg-blush-wash text-mauve",
    badge: "bg-blush-wash text-mauve",
  },
  start_today: {
    icon: "flag",
    chip: "bg-blush-wash text-mauve",
    badge: "bg-blush-wash text-mauve",
  },
};

function TaskRow({
  task,
  onRecorded,
}: {
  task: GoalTaskView;
  onRecorded: (state: CheckInState) => void;
}) {
  const [coachOpen, setCoachOpen] = useState(false);
  const tone = URGENCY[task.urgencyKind];

  return (
    <li className="rounded-2xl border border-blush bg-white px-4 py-4 shadow-soft sm:px-5">
      <div className="flex gap-3 sm:gap-4">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.chip}`}
        >
          <Icon name={tone.icon} className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* Text, not colour alone (WCAG 1.4.1): the badge says what the
                state is, so nothing here depends on telling blush from cream. */}
            <span
              className={`rounded-pill px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tone.badge}`}
            >
              {task.urgencyLabel}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-mauve">
              <Icon name="calendar" className="h-4 w-4" />
              {task.dateLabel}
            </span>
          </div>

          <h3 className="mt-2 text-[1.05rem] font-semibold leading-snug text-ink">{task.title}</h3>
          {/* Already a sentence — see taskContextLine. Wrapping it here is
              what produced "Because This is a key piece…". */}
          <p className="mt-1 text-[0.95rem] leading-relaxed text-mauve">{task.reason}</p>

          {(task.estimatedMinutes || task.milestoneTitle || task.waitingOn) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mauve-light">
              {task.estimatedMinutes && <span>~{task.estimatedMinutes} min</span>}
              {task.milestoneTitle && (
                <>
                  {task.estimatedMinutes && <span aria-hidden="true">·</span>}
                  <span>{task.milestoneTitle}</span>
                </>
              )}
              {task.waitingOn && (
                <>
                  {(task.estimatedMinutes || task.milestoneTitle) && (
                    <span aria-hidden="true">·</span>
                  )}
                  {/* §3 — a NAME. No invitation, no account for that person. */}
                  <span>
                    <span className="font-medium text-mauve">Waiting on:</span> {task.waitingOn}
                  </span>
                </>
              )}
            </p>
          )}

          {/* §13 — every row reaches the coach. "Not done" and "I'm stuck"
              open it rather than quietly rescheduling, which is the whole
              point of that section, so the actions are never behind a menu
              and never dropped at a narrow width. */}
          {coachOpen ? (
            <ExecutionBlockCoach
              taskId={task.id}
              taskTitle={task.title}
              onDone={() => setCoachOpen(false)}
            />
          ) : (
            <TaskActions
              taskId={task.id}
              reminderId={task.reminderId}
              onNeedsCoach={() => setCoachOpen(true)}
              onRecorded={onRecorded}
            />
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * PRD §17 — what this goal needs today, three rows at a time.
 *
 * Three VISIBLE, not three in total: §4.5 caps the priority actions, and the
 * count line above says how many there really are, so nothing is hidden — it
 * is one tap away instead of thirty rows deep. The mockup this replaces
 * showed five plus "Show 5 more"; five is already the backlog the cap exists
 * to prevent.
 */
export default function GoalTaskList({
  tasks,
  summary,
  visibleCount,
  onCompleted,
}: {
  tasks: GoalTaskView[];
  /** "2 overdue · 3 due today", computed on the server. */
  summary: string;
  visibleCount: number;
  /** Fired when a task is marked done, so the page can open the history. */
  onCompleted?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [recorded, setRecorded] = useState<CheckInState | null>(null);
  const listId = useId();

  // The confirmation lives here rather than on the row: a completed row leaves
  // the list on the next render, and a message that unmounts with it is a
  // message nobody reads.
  function handleRecorded(state: CheckInState) {
    setRecorded(state);
    if (state === "done") onCompleted?.();
  }

  const shown = expanded ? tasks : tasks.slice(0, visibleCount);
  const hidden = tasks.length - shown.length;

  return (
    <section
      aria-labelledby="today-heading"
      className="rounded-3xl border border-blush bg-white p-5 shadow-soft sm:p-6"
    >
      <h2 id="today-heading" className="text-xl font-bold text-ink sm:text-2xl">
        {GOAL_TODAY_HEADING}
      </h2>
      {/* Polite, because this line changes when a task is checked off and the
          page refreshes; announcing the new count is how a screen reader user
          learns the row went somewhere. */}
      <p aria-live="polite" className="mt-1 min-h-[1.5rem] font-semibold text-berry">
        {summary}
      </p>
      <p className="mt-0.5 text-sm text-mauve">{GOAL_TODAY_SUBTEXT}</p>

      {/* role="status" so it is announced without stealing focus. It stays
          until the next check-in rather than timing out: a confirmation that
          disappears on its own is one a slow reader never sees. */}
      {recorded && recorded !== "waiting_on_someone" && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-2xl bg-blush-light px-4 py-3 text-[0.95rem] font-medium text-berry"
        >
          <Icon name="check" className="mt-0.5 h-4 w-4" />
          {CHECKIN_CONFIRMATION[recorded]}
        </p>
      )}

      {tasks.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-blush-wash px-5 py-4 text-mauve">{GOAL_TODAY_EMPTY}</p>
      ) : (
        <>
          <ul id={listId} className="mt-5 space-y-3">
            {shown.map((task) => (
              <TaskRow key={task.id} task={task} onRecorded={handleRecorded} />
            ))}
          </ul>

          {tasks.length > visibleCount && (
            // A real toggle rather than a button that vanishes once used, so
            // aria-expanded has both states to report and the list can be put
            // back the way it was.
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              aria-controls={listId}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-blush bg-blush-wash px-4 py-3 text-sm font-semibold text-berry transition-colors hover:bg-blush-light"
            >
              {expanded ? "Show fewer" : `Show ${hidden} more`}
              <Icon name="chevronDown" className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
