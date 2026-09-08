"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BLOCK_CHOICES, BLOCK_QUESTION } from "@/lib/app-copy";

type Proposal = {
  new_task_title: string | null;
  new_task_minutes: number | null;
  suggested_start: string | null;
  revised_title: string | null;
  follow_up_with: string | null;
};

type Intervention = {
  block_id: string;
  intervention_type: string;
  message: string;
  proposal: Proposal;
};

/**
 * PRD §13 — the Execution Block Coach.
 *
 * Step 1 is one short question with quick choices. Step 2 is one intervention,
 * which the user accepts or declines. Nothing is rescheduled on the way
 * through: that is the whole point of the section.
 */
export default function ExecutionBlockCoach({
  taskId,
  taskTitle,
  checkInId,
  onDone,
}: {
  taskId: string;
  taskTitle: string;
  checkInId?: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<"accepted" | "declined" | null>(null);

  async function chooseBarrier(category: string) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        user_text: detail.trim() || undefined,
        check_in_id: checkInId ?? undefined,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't work that out just now.");
      setBusy(false);
      return;
    }
    setIntervention((await response.json()) as Intervention);
    setBusy(false);
  }

  async function respond(accepted: boolean) {
    if (!intervention) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/blocks/${intervention.block_id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't save that.");
      setBusy(false);
      return;
    }
    setApplied(accepted ? "accepted" : "declined");
    setBusy(false);
    router.refresh();
  }

  if (applied) {
    return (
      <div role="status" className="mt-4 rounded-xl bg-blush-wash px-4 py-3 text-sm leading-relaxed text-ink">
        {applied === "accepted"
          ? "Done — that's on your list now."
          : "No problem. Nothing has been moved."}
        <button
          type="button"
          onClick={onDone}
          className="ml-3 font-semibold text-berry hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  if (intervention) {
    const { proposal } = intervention;
    return (
      <div className="mt-4 rounded-xl border border-blush bg-blush-wash p-5">
        <p className="text-[0.98rem] leading-relaxed text-ink">{intervention.message}</p>

        {(proposal.new_task_title || proposal.revised_title) && (
          <div className="mt-3 rounded-lg bg-white px-4 py-3">
            <p className="text-sm font-semibold text-ink">
              {proposal.new_task_title ?? proposal.revised_title}
            </p>
            {proposal.new_task_minutes && (
              <p className="mt-0.5 text-sm text-mauve">About {proposal.new_task_minutes} minutes</p>
            )}
            {proposal.follow_up_with && (
              <p className="mt-0.5 text-sm text-mauve">With {proposal.follow_up_with}</p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-berry">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => respond(true)}
            disabled={busy}
            className="rounded-pill bg-berry px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:opacity-60"
          >
            {busy ? "Saving…" : "Let's do that"}
          </button>
          <button
            type="button"
            onClick={() => respond(false)}
            disabled={busy}
            className="rounded-pill border border-blush bg-white px-5 py-2 text-sm font-semibold text-mauve disabled:opacity-60"
          >
            Not this time
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-blush bg-blush-wash p-5">
      <fieldset disabled={busy}>
        <legend className="text-[0.98rem] font-semibold text-ink">{BLOCK_QUESTION}</legend>
        <p className="mt-1 text-sm text-mauve">
          No judgement — this just helps Vezri find the smallest way forward on &ldquo;{taskTitle}
          &rdquo;.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {BLOCK_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => chooseBarrier(choice.id)}
              className="rounded-pill border border-blush bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-blush-light disabled:opacity-60"
            >
              {choice.label}
            </button>
          ))}
        </div>

        <label htmlFor={`detail-${taskId}`} className="mt-4 block text-sm font-medium text-ink">
          Anything else? <span className="font-normal text-mauve-light">(optional)</span>
        </label>
        <input
          id={`detail-${taskId}`}
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-2.5 text-sm text-ink focus:border-berry"
        />
      </fieldset>

      {busy && (
        <p aria-live="polite" className="mt-3 text-sm text-mauve">
          Working out the smallest way forward…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
