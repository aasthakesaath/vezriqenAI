"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import VezriWorking, { POSE_FOR } from "@/components/VezriWorking";
import { BLOCK_CHOICES, BLOCK_QUESTION, COACH_STEPS } from "@/lib/app-copy";

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
 *
 * ONE CHIP IS THE WHOLE INPUT. An "Anything else? (optional)" box used to sit
 * under the chips — the same box, and the same failure, as the one cut from
 * StuckPanel: it appeared before anything had been picked, gave no sign that
 * picking was required, and said the same thing as the "Something else" chip
 * in a vaguer form. People typed into it and nothing happened, because the
 * chips were the submit and none had been clicked.
 *
 * ONE TAP IS THE WHOLE INTERACTION. A confirm button stood here briefly,
 * disabled until a chip was picked — an affordance that existed to say a
 * choice was required, back when a text box made that ambiguous. With the box
 * gone the chip IS the input and choosing is the only action on the screen, so
 * the button was a tap that bought nothing. The tapped chip carries the wait
 * itself instead.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<"accepted" | "declined" | null>(null);
  // `busy` covers both requests; `thinking` is only the model call, so the
  // waiting state never appears for the one-field write that accepts or
  // declines an intervention.
  const [thinking, setThinking] = useState<string | null>(null);
  /**
   * The double-tap guard.
   *
   * `busy` cannot do this job: setState is asynchronous, so two taps landing
   * in the same tick both read the old value and both fetch — and each request
   * here writes an execution_blocks row and pays for a model call. A ref is
   * set synchronously in the handler, so the second tap sees it immediately.
   */
  const inFlight = useRef(false);

  async function chooseBarrier(chosen: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setThinking(chosen);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: chosen,
        check_in_id: checkInId ?? undefined,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't work that out just now.");
      setBusy(false);
      inFlight.current = false;
      return;
    }
    setIntervention((await response.json()) as Intervention);
    setThinking(null);
    setBusy(false);
    inFlight.current = false;
  }

  async function respond(accepted: boolean) {
    if (!intervention || inFlight.current) return;
    inFlight.current = true;
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
      inFlight.current = false;
      return;
    }
    setApplied(accepted ? "accepted" : "declined");
    setBusy(false);
    inFlight.current = false;
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

  /* ONE TAP IS THE WHOLE INTERACTION. See the note at the top of the file for
   * the box that used to sit under these chips and the confirm button that
   * briefly replaced it. The tapped chip has to carry the wait, or nothing
   * says which barrier registered: it fills, takes a trailing ellipsis, and
   * reports aria-busy, while the fieldset takes the rest out of reach. An
   * ellipsis rather than a spinner, because globals.css collapses every
   * animation under prefers-reduced-motion — a moving part would be the one
   * signal that disappears for the people most likely to re-tap. */
  return (
    <div className="mt-4 rounded-xl border border-blush bg-blush-wash p-5">
      <fieldset disabled={busy}>
        <legend className="text-[0.98rem] font-semibold text-ink">{BLOCK_QUESTION}</legend>
        <p className="mt-1 text-sm text-mauve">
          No judgement — this just helps Vezri find the smallest way forward on &ldquo;{taskTitle}
          &rdquo;.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={BLOCK_QUESTION}>
          {BLOCK_CHOICES.map((choice) => {
            const pending = busy && thinking === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                // Only while it is true: aria-busy="false" on eight idle
                // buttons is noise a screen reader has to read past.
                aria-busy={pending || undefined}
                onClick={() => void chooseBarrier(choice.id)}
                className={`rounded-pill border px-4 py-2 text-sm transition-colors ${
                  pending
                    ? "border-berry bg-berry font-semibold text-white"
                    : `border-blush bg-white font-medium text-ink ${
                        busy ? "opacity-50" : "hover:bg-blush-light"
                      }`
                }`}
              >
                {choice.label}
                {pending && <span aria-hidden="true">&hellip;</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {thinking && (
        <VezriWorking
          className="mt-4 p-6"
          stages={[COACH_STEPS[0]]}
          pose={POSE_FOR.coach}
          note="Almost there."
          error={error}
          // Not the confused pose, even though this is a real failure. The
          // user has just told us they did not do something; §13 forbids guilt
          // or disappointment framing, and a puzzled bird holding a question
          // mark lands as being let down whatever the words say.
          errorPose={POSE_FOR.coachFailure}
          onRetry={error ? () => void chooseBarrier(thinking) : undefined}
        />
      )}
      {error && !thinking && (
        <p role="alert" className="mt-3 text-sm text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
