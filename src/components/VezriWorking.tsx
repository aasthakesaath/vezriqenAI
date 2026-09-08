"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { POSES, POSE_FOR, poseAlt, type VezriPose } from "@/lib/vezri-poses";

// Re-exported so client call sites can keep importing from here, while server
// components import from "@/lib/vezri-poses" directly. A "use client" module's
// exports become client references in the server bundle — importing POSE_FOR
// from here into a server page yielded undefined and crashed four pages.
export { POSES, POSE_FOR, poseAlt };
export type { VezriPose };

/**
 * The waiting, empty and failure states for anything that takes real time.
 *
 * Ported from Calyqen's CalyWorking, which solves the same problem for the
 * same reasons, with three deliberate changes:
 *
 *  1. No progress bar. Calyqen sweeps an indeterminate one; extraction is a
 *     single model call with no intermediate events, so there is nothing a bar
 *     could honestly measure and the stage line carries the signal alone.
 *  2. The stage list stops on its last line instead of looping, so a slow run
 *     never cycles back to "Reading your plan" and implies it started over.
 *  3. Failure is part of the component, not the caller's problem. A model call
 *     that hangs is the most likely way a user is left staring at a screen
 *     forever, so `error` and `onRetry` are first-class props.
 *
 * Artwork is chosen by POSE, never by a file path at the call site — see
 * POSE_FOR below, which is the single place a product state is mapped to a
 * drawing.
 */

/**
 * A pose on its own, for empty and error states outside a waiting card.
 *
 * `alt` is required rather than defaulted: whether the drawing is decorative
 * depends on what else is on screen, and that is the caller's call to make.
 * Pass "" when visible text already says the same thing.
 */
export function VezriPoseImage({
  pose,
  alt,
  className = "h-28 w-auto",
  priority = false,
}: {
  pose: VezriPose;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const art = POSES[pose];
  return (
    <Image
      src={art.src}
      alt={alt}
      aria-hidden={alt === "" ? "true" : undefined}
      width={art.width}
      height={art.height}
      priority={priority}
      // transition-none: changing pose swaps the image outright. A crossfade
      // between two drawings is motion nobody asked for, and it would ignore
      // prefers-reduced-motion because a transition is not an animation.
      className={`select-none transition-none ${className}`}
    />
  );
}

export interface VezriWorkingProps {
  /**
   * What Vezri reports doing, in order. The last line holds until the work
   * finishes. Plain language only — the user never sees the machinery.
   */
  stages: readonly string[];
  /** Which drawing fits the work. Name it from POSE_FOR, not by hand. */
  pose?: VezriPose;
  /** Milliseconds each stage holds before the next one. */
  stageMs?: number;
  /** Set when the work failed. Replaces the waiting state with a plain message. */
  error?: string | null;
  /**
   * The pose to show on failure. Defaults to `confused`; the coach overrides
   * it to keep §13's non-judgmental promise (see POSE_FOR.coachFailure).
   */
  errorPose?: VezriPose;
  /** Shown as a button beside the error. Omit and no retry is offered. */
  onRetry?: () => void;
  /**
   * Quiet line under the stage text. Omit it and the component says something
   * true for how long the wait has actually run — see NOTES.
   */
  note?: string;
  className?: string;
}

/**
 * The line under the stage text, chosen by how long the wait has actually run.
 *
 * "This takes a few seconds" was false. A 58 KB plan took 138 seconds in
 * testing, and telling someone "a few seconds" then holding them for over two
 * minutes is most of what makes a slow screen feel broken. These say what is
 * true at the moment they are read, and none of them is a countdown or a
 * percentage — there is nothing honest to count.
 */
const NOTES: readonly { after: number; text: string }[] = [
  { after: 0, text: "Vezri is reading your plan." },
  { after: 12_000, text: "Larger plans take a minute or two." },
  { after: 60_000, text: "Still working — nearly there." },
];

function noteFor(elapsedMs: number): string {
  let text = NOTES[0].text;
  for (const note of NOTES) if (elapsedMs >= note.after) text = note.text;
  return text;
}

export default function VezriWorking({
  stages,
  pose = "thinking",
  stageMs = 6000,
  error = null,
  errorPose = "confused",
  onRetry,
  note,
  className = "",
}: VezriWorkingProps) {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (error) return;
    if (index >= stages.length - 1) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), stageMs);
    return () => clearTimeout(timer);
  }, [index, stages.length, stageMs, error]);

  // Drives the note only. Not a countdown and not shown to the user as a
  // number — the wait has no honest estimate, and inventing one is the thing
  // this component exists not to do.
  useEffect(() => {
    if (error) return;
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - started), 5_000);
    return () => clearInterval(tick);
  }, [error]);

  const shell =
    "flex flex-col items-center gap-4 rounded-2xl border border-blush bg-white p-8 text-center shadow-soft";

  // Explicitly "is there an error", not "is the string truthy". An empty
  // message is still a failure, and treating "" as success is what kept the
  // waiting state on screen after the server had already said no.
  const failed = error !== null && error !== undefined;

  if (failed) {
    return (
      // aria-busy false: the wait is over, it just ended badly. role="alert"
      // so the failure is announced immediately rather than politely queued.
      <div aria-busy="false" className={`${shell} ${className}`}>
        <VezriPoseImage pose={errorPose} alt="" className="h-36 w-auto" />
        <div className="space-y-1.5">
          <p role="alert" className="text-[0.98rem] font-semibold text-ink">
            {error || "Vezri couldn't finish that."}
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
    <div role="status" aria-live="polite" aria-busy="true" className={`${shell} ${className}`}>
      {/* Decorative: the stage line below is the accessible name for this
          state, and it is already in the live region. */}
      {/* Calm presence, not a spinner: one slow breath, no bounce, no spin,
          and never the only signal that the screen is alive — the stage line
          changes on its own. The global prefers-reduced-motion rule collapses
          every animation to 0.01ms, which leaves a still image and that text,
          so nothing here needs a second suppression rule. */}
      <span className="animate-vezri-breathe">
        <VezriPoseImage pose={pose} alt="" priority className="h-36 w-auto" />
      </span>
      <div className="space-y-1.5">
        <p className="text-[0.98rem] font-semibold text-ink">
          {stages[Math.min(index, stages.length - 1)]}
          <span aria-hidden="true">&hellip;</span>
        </p>
        <p className="text-sm text-mauve-light">{note ?? noteFor(elapsed)}</p>
      </div>
    </div>
  );
}
