"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/icons/Icon";
import { BLOCK_CHOICES, BLOCK_QUESTION } from "@/lib/app-copy";

/**
 * "I'm stuck", from the question to something actually changing (PRD §13).
 *
 * The panel this replaces asked what got in the way, took a sentence about it,
 * and closed. Collecting a reason and returning nothing is worse than not
 * asking — it teaches someone that telling the truth here costs them
 * something and buys nothing.
 *
 * Three things come back, and the split is the design:
 *
 *   the obstacle   one sentence naming what is actually in the way, which is
 *                  usually not the box they ticked;
 *   one action     five minutes or less, doable now. ONE, not a menu — being
 *                  unable to decide is half of what being stuck is;
 *   the breakdown  two or three smaller pieces, which are not advice: they are
 *                  the rows "Break it into N pieces" writes.
 *
 * EVERY BUTTON WRITES SOMETHING. "I'll do that now" moves the task to
 * in-progress and closes the block. "Break it into N pieces" creates the
 * pieces and marks the parent split. "Move to tomorrow" moves its dates. There
 * is no path out of this panel that leaves the database as it found it — which
 * matters more than it sounds, because a "stuck" check-in writes `blocked`,
 * and a task left in that status silently disappears from Today altogether.
 */

type Step = { text: string; minutes: number };

type Advice = {
  block_id: string;
  obstacle: string;
  action: Step;
  breakdown: Step[];
};

type Applied =
  | { kind: "do_now" }
  | { kind: "split"; pieces: number }
  | { kind: "tomorrow" };

/** Narrow the response defensively: it began life as model output. */
function readAdvice(payload: unknown): Advice | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const action = body.action as Step | undefined;
  const breakdown = Array.isArray(body.breakdown) ? (body.breakdown as Step[]) : [];

  if (typeof body.block_id !== "string") return null;
  if (typeof body.obstacle !== "string" || body.obstacle.trim() === "") return null;
  if (!action || typeof action.text !== "string" || action.text.trim() === "") return null;

  const pieces = breakdown.filter(
    (step) => step && typeof step.text === "string" && step.text.trim() !== "",
  );
  if (pieces.length === 0) return null;

  return {
    block_id: body.block_id,
    obstacle: body.obstacle,
    action,
    breakdown: pieces,
  };
}

export default function StuckPanel({
  taskId,
  taskTitle,
  onDone,
}: {
  taskId: string;
  taskTitle: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  async function post(body: Record<string, unknown>) {
    return fetch(`/api/tasks/${taskId}/unstick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function ask(chosen: string) {
    setCategory(chosen);
    setBusy(true);
    setError(null);

    let response: Response;
    try {
      response = await post({ intent: "advise", category: chosen, note: note.trim() || undefined });
    } catch {
      setError({ message: "That didn’t reach Vezri — check your connection.", retryable: true });
      setBusy(false);
      return;
    }

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      setError({
        message: (payload?.error as string) ?? "Couldn’t work that out just now.",
        retryable: payload?.retryable !== false,
      });
      setBusy(false);
      return;
    }

    const parsed = readAdvice(payload);
    if (!parsed) {
      // Model output that got past the server's schema but is not renderable.
      // An inline retry, never a crash inside a task row.
      setError({ message: "Vezri’s answer came back unreadable.", retryable: true });
      setBusy(false);
      return;
    }

    setAdvice(parsed);
    setBusy(false);
  }

  async function choose(intent: "do_now" | "split" | "tomorrow") {
    if (!advice) return;
    setBusy(true);
    setError(null);

    let response: Response;
    try {
      response = await post({ intent, block_id: advice.block_id });
    } catch {
      setError({ message: "That didn’t reach Vezri — check your connection.", retryable: true });
      setBusy(false);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError({ message: payload.error ?? "Couldn’t save that.", retryable: true });
      setBusy(false);
      return;
    }

    const payload = (await response.json().catch(() => ({}))) as { pieces_created?: number };
    setBusy(false);
    setApplied(
      intent === "split"
        ? { kind: "split", pieces: payload.pieces_created ?? advice.breakdown.length }
        : { kind: intent },
    );
    // The row this panel sits in is about to change — it leaves Today when the
    // dates move, and it is replaced by its pieces when it is split.
    router.refresh();
  }

  /* ---- Applied. Every branch names what actually changed. --------------- */
  if (applied) {
    const message =
      applied.kind === "do_now"
        ? "Marked as in progress. Come back and hit Done when it’s finished."
        : applied.kind === "split"
          ? `Added ${applied.pieces} smaller ${applied.pieces === 1 ? "task" : "tasks"} to this goal. The bigger one is marked as broken up.`
          : "Moved to tomorrow. It will be waiting for you then.";

    return (
      <div
        role="status"
        className="mt-4 rounded-xl bg-blush-wash px-4 py-3 text-sm leading-relaxed text-ink"
      >
        <span className="inline-flex items-start gap-2">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-berry" />
          {message}
        </span>
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

  /* ---- The answer, and the three ways out. ------------------------------ */
  if (advice) {
    const pieces = advice.breakdown.length;
    return (
      <div className="mt-4 rounded-xl border border-blush bg-blush-wash p-5">
        <p className="text-[0.98rem] font-semibold leading-relaxed text-ink">{advice.obstacle}</p>

        <div className="mt-3 rounded-lg bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-mauve">Do this now</p>
          <p className="mt-1 text-[0.98rem] leading-relaxed text-ink">{advice.action.text}</p>
          {typeof advice.action.minutes === "number" && advice.action.minutes > 0 && (
            <p className="mt-0.5 text-sm text-mauve">About {advice.action.minutes} minutes</p>
          )}
        </div>

        <div className="mt-3 rounded-lg bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-mauve">
            Or the whole thing, smaller
          </p>
          <ol className="mt-1.5 space-y-1">
            {advice.breakdown.map((step, index) => (
              <li key={`${step.text}-${index}`} className="text-sm leading-relaxed text-ink">
                <span className="font-semibold text-mauve">{index + 1}.</span> {step.text}
                {typeof step.minutes === "number" && step.minutes > 0 && (
                  <span className="ml-1.5 text-mauve-light">~{step.minutes} min</span>
                )}
              </li>
            ))}
          </ol>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-berry">
            {error.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void choose("do_now")}
            disabled={busy}
            className="rounded-pill bg-berry px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:opacity-60"
          >
            {busy ? "Saving…" : "I’ll do that now"}
          </button>
          <button
            type="button"
            onClick={() => void choose("split")}
            disabled={busy}
            className="rounded-pill border border-blush bg-white px-5 py-2 text-sm font-semibold text-mauve disabled:opacity-60"
          >
            Break it into {pieces} {pieces === 1 ? "piece" : "pieces"}
          </button>
          <button
            type="button"
            onClick={() => void choose("tomorrow")}
            disabled={busy}
            className="rounded-pill border border-blush bg-white px-5 py-2 text-sm font-semibold text-mauve disabled:opacity-60"
          >
            Move to tomorrow
          </button>
        </div>
      </div>
    );
  }

  /* ---- Step one: what got in the way. ----------------------------------- */
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
              onClick={() => void ask(choice.id)}
              className="rounded-pill border border-blush bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-blush-light disabled:opacity-60"
            >
              {choice.label}
            </button>
          ))}
        </div>

        <label htmlFor={`note-${taskId}`} className="mt-4 block text-sm font-medium text-ink">
          Anything else? <span className="font-normal text-mauve-light">(optional)</span>
        </label>
        <input
          id={`note-${taskId}`}
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-2.5 text-sm text-ink focus:border-berry"
        />
      </fieldset>

      {busy && (
        <p role="status" className="mt-4 text-sm text-mauve">
          Working out the smallest way forward…
        </p>
      )}

      {error && !busy && (
        <div role="alert" className="mt-3">
          <p className="text-sm text-berry">{error.message}</p>
          {error.retryable && category && (
            <button
              type="button"
              onClick={() => void ask(category)}
              className="mt-1 text-sm font-semibold text-berry hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
