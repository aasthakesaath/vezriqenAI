"use client";

import Link from "next/link";
import { useState } from "react";
import TaskActions from "./TaskActions";
import { APP_ROUTES } from "@/lib/routes";

export type TodayCardView = {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  reason: string;
  estimatedMinutes: number | null;
  startBy: string | null;
  deadline: string | null;
  reminderId: string | null;
};

function shortDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * PRD §17 — "Your most important moves today", normally 1-3 cards.
 *
 * Each card carries goal, action, why it matters, estimated time and the
 * check-in actions.
 */
export default function TodayList({ cards }: { cards: TodayCardView[] }) {
  const [coachFor, setCoachFor] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <p className="mt-6 rounded-2xl border border-blush bg-white p-6 text-mauve shadow-soft">
        Nothing needs you today. That&rsquo;s a good place to be.
      </p>
    );
  }

  return (
    <ul className="mt-6 space-y-4">
      {cards.map((card) => (
        <li key={card.id} className="rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <Link
            href={`${APP_ROUTES.goals}/${card.goalId}`}
            className="text-sm font-medium text-berry hover:underline"
          >
            {card.goalTitle}
          </Link>

          <h3 className="mt-1.5 text-lg font-semibold leading-snug text-ink">{card.title}</h3>
          <p className="mt-1 text-[0.98rem] leading-relaxed text-mauve">Because {card.reason}.</p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mauve-light">
            {card.estimatedMinutes && <span>~{card.estimatedMinutes} min</span>}
            {card.startBy && <span>Start by {shortDate(card.startBy)}</span>}
            {card.deadline && <span>Due {shortDate(card.deadline)}</span>}
          </div>

          {coachFor === card.id ? (
            // The Execution Block Coach (§13) replaces this in Milestone 5.
            // Until then the check-in is recorded and nothing is silently
            // rescheduled, which is the rule that matters.
            <p
              role="status"
              className="mt-4 rounded-xl bg-blush-wash px-4 py-3 text-sm leading-relaxed text-ink"
            >
              Noted, and nothing has been moved. Vezri will help you work out what got in the way.
            </p>
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
  );
}
