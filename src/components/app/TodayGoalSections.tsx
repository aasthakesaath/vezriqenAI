"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TaskActions, { type CheckInState } from "./TaskActions";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import Icon, { type IconName } from "@/components/icons/Icon";
import { CHECKIN_CONFIRMATION_AWAY } from "@/lib/app-copy";
import type { UrgencyKind } from "@/lib/plan/goal-today";
import { VISIBLE_TASKS } from "@/lib/plan/goal-today";
import { goalPath } from "@/lib/routes";

/**
 * §4.5 applied per goal. "Three important things beat 30 tasks."
 *
 * The mockup this was rebuilt from shows five rows and a "Show 5 more", which
 * is ten rows on one screen — a task list, and §4 exists to keep this simpler
 * than one. VISIBLE_TASKS keeps the cap that matters while still letting four
 * goals each say what they need, and nothing is hidden silently: the count of
 * what is behind the control is on the control.
 *
 * The urgency, the badge, the date and the order all come from
 * lib/plan/goal-today — the same module the goal page's own Today list uses,
 * so the two screens cannot describe the same task differently.
 */

/** Remembered per goal, so a section someone closed stays closed tomorrow. */
const STORAGE_KEY = "vezriqen.today.sections";

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
  /** "2 overdue · 3 due today" */
  summary: string;
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

function readStored(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === "boolean",
      ),
    ) as Record<string, boolean>;
  } catch {
    // Private mode, a quota, a hand-edited value. Defaults are always usable.
    return {};
  }
}

export default function TodayGoalSections({ sections }: { sections: TodaySectionView[] }) {
  /**
   * null until the effect has run, so the first client render matches the
   * server's and hydration has nothing to reconcile. Reading localStorage
   * during render would be a mismatch on every visit.
   */
  const [remembered, setRemembered] = useState<Record<string, boolean> | null>(null);
  const [shown, setShown] = useState<Record<string, number>>({});
  const [coachFor, setCoachFor] = useState<string | null>(null);
  // Screen-level, not row-level: the row a check-in describes leaves the list
  // on the refresh that follows, taking any message inside it along.
  const [recorded, setRecorded] = useState<CheckInState | null>(null);

  useEffect(() => setRemembered(readStored()), []);

  /**
   * The top section starts open and the rest start closed, as drawn. That is
   * only defensible because a closed header still states what is inside it —
   * see `summary` — so closing is tidying rather than hiding.
   */
  const isOpen = (goalId: string, index: number) => remembered?.[goalId] ?? index === 0;

  function toggle(goalId: string, index: number) {
    const next = { ...(remembered ?? {}), [goalId]: !isOpen(goalId, index) };
    setRemembered(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not being able to remember is not a reason to refuse to open.
    }
  }

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

      {sections.map((section, index) => {
        const open = isOpen(section.goalId, index);
        const visible = shown[section.goalId] ?? VISIBLE_TASKS;
        const rows = section.tasks.slice(0, visible);
        const remaining = section.tasks.length - rows.length;
        const panelId = `today-section-${section.goalId}`;

        return (
          <section
            key={section.goalId}
            /* No overflow-hidden. It was here to clip children to the rounded
               corners, and it is also the one ancestor able to clamp the
               Execution Block Coach — the panel that opens INSIDE this box and
               is taller than everything else on the screen. Corner rounding is
               worth a class on the header button; it is not worth a clip that
               can silently swallow §13's core interaction. */
            className="rounded-2xl border border-blush bg-white shadow-soft"
          >
            {/* A real <button> in a heading: the USWDS accordion pattern the
                rest of the product already follows (see Disclosure.tsx). */}
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(section.goalId, index)}
                className={`flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-blush-wash sm:px-5 ${
                  open ? "rounded-t-2xl" : "rounded-2xl"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush-light text-berry">
                  <Icon name={section.icon} />
                </span>

                <span className="min-w-0 flex-1">
                  {/* Wraps rather than truncating. A name that has to be cut
                      to fit is a name that should not have been this long —
                      goalLabel guarantees a short one — and CSS truncation is
                      how "By Dec 31, 2026, turn Caly…" reached the screen. */}
                  <span className="block text-[1.05rem] font-semibold leading-snug text-ink">
                    {section.goalLabel}
                  </span>
                  {/* Below 640px the pill would squeeze the goal name to a few
                      characters, so the count moves under it. INSIDE the
                      button, not a sibling pulled up with a negative margin:
                      that margin overlapped the header by 8px and is the third
                      time this screen has shipped overlapping boxes. */}
                  <span className="mt-0.5 block text-sm font-semibold text-berry sm:hidden">
                    {section.summary}
                  </span>
                </span>

                {/* On the header, so a closed section still says what is in it. */}
                <span className="hidden shrink-0 rounded-pill bg-blush-light px-3 py-1 text-sm font-semibold text-berry sm:inline">
                  {section.summary}
                </span>

                <span className={`text-mauve ${open ? "rotate-180" : ""}`}>
                  <Icon name="chevronDown" />
                </span>
              </button>
            </h3>

            {/* `hidden` rather than unmounted: in-page find still reaches the
                text, and a screen reader's cursor is not surprised by content
                appearing from nowhere. */}
            <div id={panelId} hidden={!open} className="border-t border-blush">
              <ul className="divide-y divide-blush/70">
                {rows.map((task) => {
                  const tone = TONE[task.urgency];
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

                          <div className="mt-3 sm:flex sm:justify-end">
                            {coachFor === task.id ? (
                              <ExecutionBlockCoach
                                taskId={task.id}
                                taskTitle={task.title}
                                onDone={() => setCoachFor(null)}
                              />
                            ) : (
                              <TaskActions
                                taskId={task.id}
                                reminderId={task.reminderId}
                                onNeedsCoach={setCoachFor}
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

              {(remaining > 0 || visible > VISIBLE_TASKS) && (
                <button
                  type="button"
                  aria-expanded={remaining === 0}
                  aria-controls={panelId}
                  onClick={() =>
                    setShown((current) => ({
                      ...current,
                      [section.goalId]: remaining > 0 ? section.tasks.length : VISIBLE_TASKS,
                    }))
                  }
                  className="flex w-full items-center justify-center gap-2 border-t border-blush bg-blush-wash px-5 py-3 text-sm font-semibold text-berry transition-colors hover:bg-blush-light"
                >
                  {remaining > 0 ? `Show ${remaining} more` : "Show fewer"}
                  <span className={remaining === 0 ? "rotate-180" : ""}>
                    <Icon name="chevronDown" className="h-4 w-4" />
                  </span>
                </button>
              )}

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
        );
      })}
    </div>
  );
}
