"use client";

import { useId, useState } from "react";
import Icon from "@/components/icons/Icon";
import ProvenanceBadge from "@/components/plan/ProvenanceBadge";
import { GOAL_COMPLETED_HEADING, GOAL_COMPLETED_SUBTEXT } from "@/lib/app-copy";

export type CompletedTaskView = {
  id: string;
  title: string;
  /** Why it mattered, kept for the detail panel rather than the row. */
  reason: string;
  /** "8 Sep", already formatted. Null when the row predates completed_at. */
  completedOn: string | null;
  estimatedMinutes: number | null;
  milestoneTitle: string | null;
  origin: "explicit" | "inferred";
  confidence: number;
};

/** How many completed rows appear before the user asks for more. */
const PAGE = 5;

/**
 * The history, under the day's work.
 *
 * Collapsed by default and quieter than an active row: a check, the title, the
 * date it was finished, and View. Finished work is worth being able to find —
 * it is the evidence that the plan is moving — but it must not compete with
 * the three things that still need doing.
 *
 * View expands the row in place rather than navigating. There is no task
 * detail route, and inventing one to satisfy a button would be a page nobody
 * asked for; the details a completed task actually has (why it mattered, which
 * milestone, where it came from) fit in the row.
 */
export default function CompletedTaskList({
  tasks,
  open,
  onOpenChange,
}: {
  tasks: CompletedTaskView[];
  /**
   * Open state, owned by the pane so that finishing a task can open this
   * section — a task that vanishes into a collapsed heading reads as a task
   * that was lost, not one that was filed.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const panelId = useId();

  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, shown);
  const hidden = tasks.length - visible.length;

  return (
    <section aria-labelledby="completed-heading" className="rounded-3xl border border-blush bg-blush-wash p-5 sm:p-6">
      <h2 id="completed-heading" className="m-0">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-xl font-bold text-ink sm:text-2xl">
              {GOAL_COMPLETED_HEADING}
            </span>
            <span className="mt-0.5 block text-sm font-normal text-mauve">
              {tasks.length} finished · {GOAL_COMPLETED_SUBTEXT}
            </span>
          </span>
          <Icon
            name="chevronDown"
            className={`h-5 w-5 text-mauve ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>

      {/* Hidden rather than unmounted, so in-page find still reaches the text
          and the reading order does not change when it opens. */}
      <div id={panelId} hidden={!open} className="mt-4">
        <ul className="space-y-2">
          {visible.map((task) => (
            <CompletedRow key={task.id} task={task} />
          ))}
        </ul>

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShown((count) => count + PAGE)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-blush bg-white px-4 py-3 text-sm font-semibold text-mauve transition-colors hover:bg-blush-light"
          >
            Show {Math.min(PAGE, hidden)} more
            <Icon name="chevronDown" className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}

function CompletedRow({ task }: { task: CompletedTaskView }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  return (
    <li className="rounded-2xl border border-blush bg-white px-4 py-3">
      {/* The date sits UNDER the title, not beside it. Beside it, a title long
          enough to wrap at 375px ran down the left of the row while the date
          stayed vertically centred against it, and the two read as one
          collided line. */}
      <div className="flex items-start gap-3">
        <Icon name="check" className="mt-0.5 h-5 w-5 text-mauve" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.98rem] font-medium text-mauve">{task.title}</p>
          {task.completedOn && (
            <p className="mt-0.5 text-sm text-mauve-light">Completed {task.completedOn}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={detailId}
          className="shrink-0 rounded-pill border border-blush bg-white px-4 py-1.5 text-sm font-semibold text-mauve transition-colors hover:bg-blush-wash"
        >
          {open ? "Hide" : "View"}
        </button>
      </div>

      <div id={detailId} hidden={!open} className="mt-3 border-t border-blush pt-3">
        <p className="text-[0.95rem] leading-relaxed text-mauve">Because {task.reason}.</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mauve-light">
          {task.milestoneTitle && <span>{task.milestoneTitle}</span>}
          {task.estimatedMinutes && <span>~{task.estimatedMinutes} min</span>}
          {/* §7 — where the item came from travels with it, here too. */}
          <ProvenanceBadge origin={task.origin} confidence={task.confidence} />
        </p>
      </div>
    </li>
  );
}
