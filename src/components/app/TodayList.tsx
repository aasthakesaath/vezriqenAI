"use client";

import Link from "next/link";
import { useState } from "react";
import TaskActions from "./TaskActions";
import ExecutionBlockCoach from "@/components/coach/ExecutionBlockCoach";
import { APP_ROUTES } from "@/lib/routes";
import { formatDay } from "@/lib/time";

/** Dates only here; the shared helper owns every format the user reads. */
const shortDay = (value: string | null) => (value ? formatDay(value) : null);

export type TodayCardView = {
  id: string;
  goalId: string;
  /** Six-word name. Never the SMART statement — see lib/goal-label.ts. */
  goalLabel: string;
  /** The milestone this task sits under, when it has one. */
  milestoneTitle: string | null;
  title: string;
  reason: string;
  estimatedMinutes: number | null;
  startBy: string | null;
  deadline: string | null;
  reminderId: string | null;
  /** Set when extraction flagged a person this task waits on (§9, §13). */
  waitingOn: string | null;
};

/** Cards sharing a milestone, so the heading is said once rather than per card. */
export type TodayGroupView = {
  key: string;
  goalId: string;
  goalLabel: string;
  milestoneTitle: string | null;
  cards: TodayCardView[];
};

/**
 * PRD §17 — "Your most important moves today", normally 1–3 cards.
 *
 * Each card carries the action, why it matters, the estimate, the dates and
 * the check-in actions. What it does NOT carry is the goal statement: that is
 * ~60 words, it was being rendered above every title, and it pushed the actual
 * task out of the first thing you read. The milestone and the six-word goal
 * label go in the group heading instead, once, and both link to the goal page
 * where the full statement lives.
 */
export default function TodayList({ groups }: { groups: TodayGroupView[] }) {
  const [coachFor, setCoachFor] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
        Nothing needs you today. That&rsquo;s a good place to be.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`}>
          {/* The context a card needs: which milestone, which goal. Both link
              to the goal page rather than expanding here — Today shows three
              cards and 60 words of statement would push the other two off. */}
          {/* The goal, once per group. Never the SMART statement: it is ~60
              words, it was rendering above every task title, and the full
              target lives on the goal page. */}
          <h3 id={`group-${group.key}`} className="text-sm font-semibold leading-relaxed">
            <Link
              href={`${APP_ROUTES.goals}/${group.goalId}`}
              className="text-mauve hover:text-berry hover:underline"
            >
              {group.goalLabel}
            </Link>
          </h3>

          <ul className="mt-3 space-y-4">
            {group.cards.map((card) => (
              <li
                key={card.id}
                className="rounded-2xl border border-blush bg-white p-5 shadow-soft sm:p-6"
              >
                {/* Still a card, not a row of columns — §4 keeps this simpler
                    than a task manager, and a three-column grid IS that
                    pattern. Order is title, then context, then the quiet
                    metadata line, then actions. */}
                <h4 className="text-lg font-semibold leading-snug text-ink sm:text-xl">
                  {card.title}
                </h4>

                {card.milestoneTitle && (
                  <p className="mt-1 text-sm">
                    <Link
                      href={`${APP_ROUTES.goals}/${card.goalId}`}
                      className="font-medium text-berry hover:underline"
                    >
                      {card.milestoneTitle}
                    </Link>
                  </p>
                )}

                <p className="mt-2 text-[0.98rem] leading-relaxed text-mauve">
                  Because {card.reason}.
                </p>

                {/* One muted line. "Waiting on" belongs here rather than in a
                    column of its own: most tasks have nobody, and an
                    always-present empty column is noise. §3 keeps it to a
                    NAME — no invitation, no account for that person, no email
                    to them. */}
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mauve-light">
                  {card.estimatedMinutes && <span>~{card.estimatedMinutes} min</span>}
                  {card.startBy && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Start by {shortDay(card.startBy)}</span>
                    </>
                  )}
                  {card.deadline && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Due {shortDay(card.deadline)}</span>
                    </>
                  )}
                  {card.waitingOn && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        <span className="font-medium text-mauve">Waiting on:</span>{" "}
                        {card.waitingOn}
                      </span>
                    </>
                  )}
                </p>

                {coachFor === card.id ? (
                  <ExecutionBlockCoach
                    taskId={card.id}
                    taskTitle={card.title}
                    onDone={() => setCoachFor(null)}
                  />
                ) : (
                  <TaskActions
                    taskId={card.id}
                    reminderId={card.reminderId}
                    onNeedsCoach={setCoachFor}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
