"use client";

import { useState } from "react";
import Icon from "@/components/icons/Icon";
import TaskGuidance from "@/components/coach/TaskGuidance";

/**
 * Work that is not in the user's control (PRD §13, §3).
 *
 * These rows were drawn inline in TodayScreen as a title, a name and a goal
 * label, and they were the only task rows in the product with no way to ask
 * how to do the thing. That is backwards: a task waiting on somebody else is
 * precisely the one where the next move is unobvious — the answer is usually a
 * specific message to a specific person, which is exactly what the guidance
 * route is for. They now expand like every other card.
 *
 * §3 still holds: the other person is a NAME. No invitation, no account for
 * them, no email to them.
 */

export type WaitingOnView = {
  id: string;
  title: string;
  /** The person's name, or null when extraction flagged a dependency with none. */
  waitingOn: string | null;
  goalLabel: string;
  estimatedMinutes: number | null;
};

function WaitingOnRow({ task }: { task: WaitingOnView }) {
  const [open, setOpen] = useState(false);
  const panelId = `waiting-on-${task.id}`;

  return (
    <li className="rounded-xl border border-blush bg-white px-4 py-4 sm:px-5">
      <p className="font-medium text-ink">{task.title}</p>

      {/* One wrap-safe line, not three stacked paragraphs.
          gap-y-1 is load-bearing: a flex-wrap row with only a horizontal gap
          puts every wrapped line hard against the one above it, and the
          "Waiting on" item is the one that wraps first because it is the
          longest. That is what collided with the estimate. */}
      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-mauve-light">
        <span className="font-medium text-mauve">{task.goalLabel}</span>
        {task.estimatedMinutes && (
          <>
            <span aria-hidden="true">·</span>
            <span>~{task.estimatedMinutes} min</span>
          </>
        )}
        {task.waitingOn && (
          <>
            <span aria-hidden="true">·</span>
            {/* min-w-0 so a long name wraps inside its own item rather than
                pushing the row wider than the card. */}
            <span className="min-w-0">
              <span className="font-medium text-mauve">Waiting on:</span> {task.waitingOn}
            </span>
          </>
        )}
      </p>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-berry transition-colors hover:underline"
      >
        {open ? "Hide the steps" : "How do I do this?"}
        <Icon name="chevronDown" className={`h-4 w-4 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Mounted only once opened — mounting TaskGuidance is what pays for the
          model call, so a closed row costs nothing. */}
      <div id={panelId} hidden={!open} className="mt-3">
        {open && <TaskGuidance taskId={task.id} />}
      </div>
    </li>
  );
}

export default function WaitingOnList({ tasks }: { tasks: WaitingOnView[] }) {
  if (tasks.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2">
      {tasks.map((task) => (
        <WaitingOnRow key={task.id} task={task} />
      ))}
    </ul>
  );
}
