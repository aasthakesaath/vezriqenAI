"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * The waiting state for anything that calls the model.
 *
 * Ported from Calyqen's CalyWorking, which solves the same problem for the
 * same reasons, with three deliberate changes for this product:
 *
 *  1. No progress bar. Calyqen shows an indeterminate sweeping bar; here the
 *     stage line carries the "still working" signal on its own. A bar that
 *     cannot report real progress is decoration standing where information
 *     should be, and the one thing this component must not do is imply it
 *     knows how far along it is. Extraction is a single model call — there
 *     are no intermediate events to report — so the stages advance on a
 *     timer, and that is exactly why nothing here may look measured.
 *  2. The stage list stops on its last line instead of looping, so a slow run
 *     never cycles back to "Reading your plan" and implies it started over.
 *  3. Failure is part of the component, not the caller's problem. A model
 *     call that hangs is the most likely way a user is left staring at a
 *     screen forever, so `error` and `onRetry` are first-class props.
 *
 * Motion: the mascot bobs. Global CSS collapses every animation to 0.01ms
 * under prefers-reduced-motion, so a user who asked for less motion gets a
 * still image and the changing stage line — which is the honest signal
 * anyway, and needs no special case here.
 */

export interface VezriWorkingProps {
  /**
   * What Vezri reports doing, in order. The last line holds until the work
   * finishes. Plain language only — the user never sees the machinery.
   */
  stages: readonly string[];
  /** Milliseconds each stage holds before the next one. */
  stageMs?: number;
  /** Set when the work failed. Replaces the waiting state with a plain message. */
  error?: string | null;
  /** Shown as a button beside the error. Omit and no retry is offered. */
  onRetry?: () => void;
  /** Quiet line under the stage text. */
  note?: string;
  className?: string;
}

const DEFAULT_NOTE = "This takes a few seconds.";

export default function VezriWorking({
  stages,
  stageMs = 6000,
  error = null,
  onRetry,
  note = DEFAULT_NOTE,
  className = "",
}: VezriWorkingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (error) return;
    if (index >= stages.length - 1) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), stageMs);
    return () => clearTimeout(timer);
  }, [index, stages.length, stageMs, error]);

  const shell =
    "flex flex-col items-center gap-4 rounded-2xl border border-blush bg-white p-8 text-center shadow-soft";

  if (error) {
    return (
      // aria-busy false: the wait is over, it just ended badly. role="alert"
      // so the failure is announced immediately rather than politely queued.
      <div aria-busy="false" className={`${shell} ${className}`}>
        <VezriPortrait still />
        <div className="space-y-1.5">
          <p role="alert" className="text-[0.98rem] font-semibold text-ink">
            {error}
          </p>
          <p className="text-sm text-mauve-light">Nothing was lost — you can try again.</p>
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-primary mt-1">
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    // role="status" + aria-live="polite" announces each stage without
    // interrupting; aria-busy tells assistive tech the region is mid-update.
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`${shell} ${className}`}
    >
      <VezriPortrait />
      <div className="space-y-1.5">
        <p className="text-[0.98rem] font-semibold text-ink">
          {stages[Math.min(index, stages.length - 1)]}
          <span aria-hidden="true">&hellip;</span>
        </p>
        <p className="text-sm text-mauve-light">{note}</p>
      </div>
    </div>
  );
}

/**
 * The approved mascot asset, whole and uncropped.
 *
 * The full figure rather than vezri-avatar.webp: the avatar is built for a
 * small circular mask, and this card has the room to show Vezri actually at
 * work — bow drawn, which is the point of the moment. Same source file, no new
 * artwork and no new pose; PRD §30.2 allows only the existing Vezri assets.
 */
function VezriPortrait({ still = false }: { still?: boolean }) {
  return (
    <span className={`block ${still ? "" : "animate-vezri-bob"}`}>
      <Image
        src="/brand/vezri.webp"
        alt=""
        aria-hidden="true"
        width={340}
        height={352}
        priority
        sizes="88px"
        className="h-auto w-[5.5rem] select-none"
      />
    </span>
  );
}
