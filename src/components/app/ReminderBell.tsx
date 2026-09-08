"use client";

import Link from "next/link";
import { useState } from "react";
import { APP_ROUTES } from "@/lib/routes";
import { formatDayTime } from "@/lib/time";

export type BellReminder = {
  id: string;
  taskId: string | null;
  taskTitle: string;
  scheduledAt: string;
  due: boolean;
  answered: boolean;
};

/**
 * The in-app reminder centre, as a surface rather than a page.
 *
 * §12 makes in-app the channel that always works — it is the one that does not
 * depend on a provider key — so it cannot simply lose its home when /reminders
 * stops being a destination. A reminder must always have somewhere to appear,
 * and this is it.
 *
 * Shows what is due and what happened recently. Answering still happens on
 * Today, where the task and its check-in actions are.
 */
export default function ReminderBell({
  reminders,
  timeZone,
}: {
  reminders: BellReminder[];
  /** The user's own zone. A reminder time is a moment, so it needs one. */
  timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  const dueCount = reminders.filter((r) => r.due && !r.answered).length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="reminder-centre"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-blush text-berry transition-colors hover:bg-blush-wash"
      >
        {/* The count is in the accessible name, not only in the dot — a badge
            nobody can read is decoration. */}
        <span className="sr-only">
          {dueCount === 0
            ? "Reminders, nothing due"
            : `Reminders, ${dueCount} needing an answer`}
        </span>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z" strokeLinejoin="round" />
          <path d="M10 18.5a2 2 0 004 0" strokeLinecap="round" />
        </svg>
        {dueCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-berry px-1 text-[0.7rem] font-bold text-white"
          >
            {dueCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="reminder-centre"
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-blush bg-white p-4 shadow-lift"
        >
          <h2 className="text-sm font-semibold text-ink">Reminders</h2>
          {reminders.length === 0 ? (
            <p className="mt-2 text-sm text-mauve">Nothing waiting on you.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reminders.slice(0, 8).map((reminder) => (
                <li
                  key={reminder.id}
                  className="rounded-xl border border-blush/60 bg-blush-wash px-3 py-2.5"
                >
                  <p className="text-sm font-medium text-ink">{reminder.taskTitle}</p>
                  <p className="mt-0.5 text-xs text-mauve">
                    {formatDayTime(reminder.scheduledAt, timeZone)}
                    {" · "}
                    {/* §12 — silence is never completion. */}
                    {reminder.answered ? "Answered" : reminder.due ? "Needs an answer" : "Upcoming"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={APP_ROUTES.today}
            onClick={() => setOpen(false)}
            className="mt-3 inline-block text-sm font-medium text-berry hover:underline"
          >
            Go to Today
          </Link>
        </div>
      )}
    </div>
  );
}
