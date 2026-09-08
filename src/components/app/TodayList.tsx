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
          <h3 id={`group-${group.key}`} className="text-sm leading-relaxed">
            <Link
              href={`${APP_ROUTES.goals}/${group.goalId}`}
              className="font-semibold text-berry hover:underline"
            >
              {group.milestoneTitle ?? group.goalLabel}
            </Link>
            {group.milestoneTitle && (
              <span className="text-mauve-light">
                {" · "}
                <Link
                  href={`${APP_ROUTES.goals}/${group.goalId}`}
                  className="hover:text-berry hover:underline"
                >
                  {group.goalLabel}
                </Link>
              </span>
            )}
          </h3>

          <ul className="mt-3 space-y-4">
            {group.cards.map((card) => (
              <li
                key={card.id}
                className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
              >
                <h4 className="text-lg font-semibold leading-snug text-ink">{card.title}</h4>
                <p className="mt-1.5 text-[0.98rem] leading-relaxed text-mauve">
                  Because {card.reason}.
                </p>

                {/* §3: a name, and nothing else. No invitation, no account for
                    that person, no email to them — that is Phase 2. */}
                {card.waitingOn && (
                  <p className="mt-2 text-[0.95rem] text-mauve">
                    <span className="font-medium text-ink">Waiting on:</span> {card.waitingOn}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mauve-light">
                  {card.estimatedMinutes && <span>~{card.estimatedMinutes} min</span>}
                  {card.startBy && <span>Start by {shortDay(card.startBy)}</span>}
                  {card.deadline && <span>Due {shortDay(card.deadline)}</span>}
                </div>

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
