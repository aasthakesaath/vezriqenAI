"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TaskActions from "./TaskActions";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import GoalIcon, { type GoalIconName } from "@/lib/goal-icons";
import type { TodayUrgency } from "@/lib/plan/today";
import { goalPath } from "@/lib/routes";

/**
 * §4.5 applied per goal. "Three important things beat 30 tasks."
 *
 * The mockup this was rebuilt from shows five rows and a "Show 5 more", which
 * is ten rows on one screen — a task list, and §4 exists to keep this simpler
 * than one. Three visible per goal section keeps the cap that matters while
 * still letting four goals each say what they need, and nothing is hidden
 * silently: the count of what is behind the control is on the control.
 */
const VISIBLE_PER_SECTION = 3;

/** Remembered per goal, so a section someone closed stays closed tomorrow. */
const STORAGE_KEY = "vezriqen.today.sections";

export type TodayTaskView = {
  id: string;
  title: string;
  /** One line of context — why this matters. Already prefixed by the page. */
  reason: string;
  /** "30 days overdue", "Due today". Uppercased by CSS, not in the string. */
  badge: string;
  urgency: TodayUrgency;
  /** "Due 10 Aug 2025" or "Start by 1 Sep". Formatted server-side, in the user's zone. */
  dateLabel: string | null;
  estimatedMinutes: number | null;
  milestoneTitle: string | null;
  reminderId: string | null;
};

export type TodaySectionView = {
  goalId: string;
  goalLabel: string;
  icon: GoalIconName;
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
const TONE: Record<TodayUrgency, { chip: string; badge: string; date: string }> = {
  overdue: {
    chip: "bg-blush-light text-berry",
    badge: "bg-blush-light text-berry",
    date: "text-berry",
  },
  due_today: {
    chip: "bg-cream text-mauve",
    badge: "bg-cream text-ink",
    date: "text-ink",
  },
  start_today: {
    chip: "bg-cream-light text-mauve",
    badge: "bg-cream-light text-mauve",
    date: "text-mauve",
  },
  needs_answer: {
    chip: "bg-blush-light text-mauve",
    badge: "bg-blush-light text-mauve",
    date: "text-mauve",
  },
};

const svg = {
  className: "h-[1.15rem] w-[1.15rem]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": "true" as const,
  focusable: "false" as const,
};

function UrgencyIcon({ urgency }: { urgency: TodayUrgency }) {
  if (urgency === "overdue") {
    // A clock wound back. Time has passed; that is all it says.
    return (
      <svg viewBox="0 0 24 24" {...svg}>
        <path d="M3.4 9.2A9 9 0 1 1 3 12" />
        <path d="M3.1 4.6v4.6h4.6" />
        <path d="M12 7.8V12l2.8 1.7" />
      </svg>
    );
  }
  if (urgency === "due_today") {
    return (
      <svg viewBox="0 0 24 24" {...svg}>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M12 7.4V12l3 1.8" />
      </svg>
    );
  }
  if (urgency === "start_today") {
    return (
      <svg viewBox="0 0 24 24" {...svg}>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M10.2 8.9 15 12l-4.8 3.1V8.9Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...svg}>
      <path d="M20.4 12.6a7.4 7.4 0 0 1-7.4 7.4H5.2l-1.6 1.6v-8.6a7.4 7.4 0 0 1 7.4-7.4h2a7.4 7.4 0 0 1 7.4 7Z" />
      <path d="M12 9.6h.01M12 12.4v2.4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" {...svg} className="h-4 w-4 shrink-0">
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.4" />
      <path d="M3.4 10h17.2M8.2 3.4v3.6M15.8 3.4v3.6" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" {...svg} className={`h-5 w-5 shrink-0 ${open ? "rotate-180" : ""}`}>
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}

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
      {sections.map((section, index) => {
        const open = isOpen(section.goalId, index);
        const visible = shown[section.goalId] ?? VISIBLE_PER_SECTION;
        const rows = section.tasks.slice(0, visible);
        const remaining = section.tasks.length - rows.length;
        const panelId = `today-section-${section.goalId}`;

        return (
          <section
            key={section.goalId}
            className="overflow-hidden rounded-2xl border border-blush bg-white shadow-soft"
          >
            {/* A real <button> in a heading: the USWDS accordion pattern the
                rest of the product already follows (see Disclosure.tsx). */}
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(section.goalId, index)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-blush-wash sm:px-5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blush-light text-berry"
                >
                  <GoalIcon name={section.icon} className="h-5 w-5" />
                </span>

                <span className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold text-ink">
                  {section.goalLabel}
                </span>

                {/* On the header, so a closed section still says what is in it. */}
                <span className="hidden shrink-0 rounded-pill bg-blush-light px-3 py-1 text-sm font-semibold text-berry sm:inline">
                  {section.summary}
                </span>

                <span className="text-mauve">
                  <Chevron open={open} />
                </span>
              </button>
            </h3>

            {/* The pill wraps to its own line rather than shrinking below
                375px, where it would otherwise push the goal name to two
                characters. */}
            <p className="-mt-2 px-4 pb-3 text-sm font-semibold text-berry sm:hidden">
              {section.summary}
            </p>

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
                          aria-hidden="true"
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.chip}`}
                        >
                          <UrgencyIcon urgency={task.urgency} />
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
                                <CalendarIcon />
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
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {(remaining > 0 || visible > VISIBLE_PER_SECTION) && (
                <button
                  type="button"
                  aria-expanded={remaining === 0}
                  aria-controls={panelId}
                  onClick={() =>
                    setShown((current) => ({
                      ...current,
                      [section.goalId]:
                        remaining > 0 ? section.tasks.length : VISIBLE_PER_SECTION,
                    }))
                  }
                  className="flex w-full items-center justify-center gap-2 border-t border-blush bg-blush-wash px-5 py-3 text-sm font-semibold text-berry transition-colors hover:bg-blush-light"
                >
                  {remaining > 0 ? `Show ${remaining} more` : "Show fewer"}
                  <Chevron open={remaining === 0} />
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
