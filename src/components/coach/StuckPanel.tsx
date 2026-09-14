"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/icons/Icon";
import { BLOCK_CHOICES, BLOCK_QUESTION } from "@/lib/app-copy";

/**
 * "I'm stuck", from the barrier to something that changed (PRD §13).
 *
 * The old panel collected a barrier and a line of free text and closed. The
 * row was written, so the data existed, but nothing came back that the person
 * could act on — which makes saying you are stuck a worse use of thirty
 * seconds than saying nothing at all.
 *
 * The free text is gone too. It sat above the chips, before anything had been
 * picked, with no sign that picking was required — and it duplicated the
 * "Something else" chip in a vaguer form. People typed into it and nothing
 * happened, because the chips were the submit and none had been clicked. One
 * chip is the whole input now, and a disabled button says so.
 *
 * Three screens, and the third is the point:
 *
 *   1. the barrier: one chip, then submit
 *   2. the obstacle named, one five-minute action, and the pieces the task
 *      becomes if that action is not the answer
 *   3. what changed, in one line
 *
 * EVERY BUTTON ON SCREEN 2 WRITES SOMETHING. "I'll do that now" puts the task
 * under way; "Break it into N pieces" creates them and stands the parent down;
 * "Move to tomorrow" moves its date. None of the three closes the panel with
 * nothing behind it, and each one says what it did before the list refreshes.
 */

type FirstAction = { text: string; minutes: number; where: string | null };
type Piece = { title: string; minutes: number };

type Analysis = {
  block_id: string;
  obstacle: string;
  first_action: FirstAction;
  breakdown: Piece[];
};

type Outcome = { message: string; titles?: string[] };

const PRIMARY =
  "rounded-pill bg-berry px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:opacity-60";
const SECONDARY =
  "rounded-pill border border-blush bg-white px-4 py-2 text-sm font-semibold text-mauve transition-colors hover:bg-blush-wash disabled:opacity-60";

export default function StuckPanel({
  taskId,
  taskTitle,
  checkInId,
  onDone,
}: {
  taskId: string;
  taskTitle: string;
  /** The check-in that reported this, so the block hangs off the right one. */
  checkInId?: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  /** The chip that is selected. Null until one is, which is what gates submit. */
  const [reason, setReason] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  /** One request shape for all four actions; see the route for why. */
  async function send(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);

    let response: Response;
    try {
      response = await fetch(`/api/tasks/${taskId}/stuck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // A dropped connection used to leave every button disabled for good.
      setError("That didn’t reach Vezri — check your connection and try again.");
      setRetryable(true);
      setBusy(null);
      return null;
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
      error?: string;
      retryable?: boolean;
    };

    if (!response.ok) {
      setError(payload.error ?? "Vezri couldn’t do that just now.");
      setRetryable(payload.retryable === true);
      setBusy(null);
      return null;
    }

    setBusy(null);
    return payload;
  }

  async function analyse(chosen: string) {
    const payload = await send(
      { action: "analyse", reason: chosen, check_in_id: checkInId ?? undefined },
      "analyse",
    );
    if (payload) setAnalysis(payload as unknown as Analysis);
  }

  async function commit() {
    if (!analysis) return;
    const payload = await send({ action: "commit", block_id: analysis.block_id }, "commit");
    if (payload) {
      setOutcome({ message: String(payload.message ?? "Recorded.") });
      router.refresh();
    }
  }

  async function split() {
    if (!analysis) return;
    const payload = await send({ action: "split", block_id: analysis.block_id }, "split");
    if (payload) {
      setOutcome({
        message: String(payload.message ?? "Recorded."),
        titles: Array.isArray(payload.created_titles)
          ? (payload.created_titles as string[])
          : undefined,
      });
      router.refresh();
    }
  }

  async function tomorrow() {
    const payload = await send(
      { action: "tomorrow", block_id: analysis?.block_id },
      "tomorrow",
    );
    if (payload) {
      setOutcome({ message: String(payload.message ?? "Moved.") });
      router.refresh();
    }
  }

  /* ---- 3. What changed. ------------------------------------------------ */
  if (outcome) {
    return (
      <div
        role="status"
        className="mt-4 rounded-xl border border-blush bg-blush-wash px-4 py-3 text-sm leading-relaxed text-ink"
      >
        <p className="flex items-start gap-2 font-medium">
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-berry" />
          {outcome.message}
        </p>
        {outcome.titles && outcome.titles.length > 0 && (
          <ul className="mt-2 space-y-1 pl-6">
            {outcome.titles.map((title) => (
              <li key={title} className="text-mauve">
                {title}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onDone}
          className="mt-3 font-semibold text-berry hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  /* ---- 2. The obstacle, the action, the pieces. ------------------------- */
  if (analysis) {
    const pieces = analysis.breakdown.length;
    return (
      <div className="mt-4 rounded-xl border border-blush bg-blush-wash p-4 sm:p-5">
        <p className="text-[0.98rem] font-medium leading-relaxed text-ink">{analysis.obstacle}</p>

        <div className="mt-3 rounded-lg bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-berry">Do this first</p>
          <p className="mt-1 text-[0.98rem] leading-relaxed text-ink">
            {analysis.first_action.text}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-mauve">
            <span className="flex items-center gap-1">
              <Icon name="clock" className="h-3.5 w-3.5" />~{analysis.first_action.minutes} min
            </span>
            {analysis.first_action.where && (
              <>
                <span aria-hidden="true">·</span>
                <span>{analysis.first_action.where}</span>
              </>
            )}
          </p>
        </div>

        <div className="mt-3">
          <p className="text-sm font-semibold text-ink">
            Or break it into {pieces} {pieces === 1 ? "piece" : "pieces"}
          </p>
          <ol className="mt-1.5 space-y-1">
            {analysis.breakdown.map((piece, index) => (
              <li key={piece.title} className="flex gap-2.5 text-sm text-mauve">
                <span aria-hidden="true" className="font-semibold text-berry">
                  {index + 1}.
                </span>
                <span className="min-w-0">
                  {piece.title} <span className="text-mauve-light">~{piece.minutes} min</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-berry">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void commit()} disabled={busy !== null} className={PRIMARY}>
            {busy === "commit" ? "Saving…" : "I’ll do that now"}
          </button>
          <button type="button" onClick={() => void split()} disabled={busy !== null} className={SECONDARY}>
            {busy === "split" ? "Adding…" : `Break it into ${pieces} pieces`}
          </button>
          <button
            type="button"
            onClick={() => void tomorrow()}
            disabled={busy !== null}
            className={SECONDARY}
          >
            {busy === "tomorrow" ? "Moving…" : "Move to tomorrow"}
          </button>
        </div>
      </div>
    );
  }

  /* ---- 1. The barrier. --------------------------------------------------
   *
   * ONE CHIP IS THE WHOLE INPUT. A free-text box used to sit under these:
   * it appeared before anything was picked, gave no sign that picking was
   * required, and said the same thing as the "Something else" chip in a
   * vaguer way — so people typed into it and nothing happened, because the
   * chips were the submit and nobody had clicked one.
   *
   * So the chips SELECT now and a button submits. That is one more tap than
   * click-to-send, bought deliberately: it gives the panel somewhere to show
   * that a choice is required, which is the thing that was missing.
   */
  const chosen = BLOCK_CHOICES.find((choice) => choice.id === reason);

  return (
    <div className="mt-4 rounded-xl border border-blush bg-blush-wash p-4 sm:p-5">
      <fieldset disabled={busy !== null}>
        <legend className="text-[0.98rem] font-semibold text-ink">{BLOCK_QUESTION}</legend>
        <p className="mt-1 text-sm text-mauve">
          No judgement — this is how Vezri finds the smallest way into &ldquo;{taskTitle}&rdquo;.
        </p>

        {/* A single-select group. aria-pressed carries the state a screen
            reader needs; the border and fill carry it for everyone else, so
            the selection is never colour alone (WCAG 1.4.1). */}
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={BLOCK_QUESTION}>
          {BLOCK_CHOICES.map((choice) => {
            const selected = reason === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setReason(choice.id)}
                className={`rounded-pill border px-4 py-2 text-sm transition-colors disabled:opacity-60 ${
                  selected
                    ? "border-berry bg-berry font-semibold text-white"
                    : "border-blush bg-white font-medium text-ink hover:bg-blush-light"
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => chosen && void analyse(chosen.id)}
            /* Disabled until a chip is picked — the affordance the free-text
               box never gave. `disabled` rather than a click that shows an
               error: a control that cannot do anything should look like it. */
            disabled={!chosen || busy !== null}
            className="rounded-pill bg-berry px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:bg-mauve-light disabled:opacity-60"
          >
            {busy === "analyse" ? "Thinking…" : "Work out what to do"}
          </button>

          {!chosen && (
            <span className="text-sm text-mauve">Pick one to carry on.</span>
          )}
        </div>
      </fieldset>

      <p aria-live="polite" className="sr-only">
        {busy ? "Working out what to do next" : ""}
      </p>

      {error && (
        <div role="alert" className="mt-3">
          <p className="text-sm text-berry">{error}</p>
          {retryable && reason && (
            // Inline, on the panel that failed. §13 has to survive a bad
            // response from the model — a closed dialog is the dead end this
            // whole flow was rebuilt to remove.
            <button
              type="button"
              onClick={() => void analyse(reason)}
              className="mt-2 rounded-pill border border-blush bg-white px-3.5 py-1.5 text-sm font-semibold text-berry transition-colors hover:bg-blush-light"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
