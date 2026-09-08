"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

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

export type VezriPose = "reading" | "thinking" | "confused";

/**
 * The three poses and their intrinsic sizes. Nothing outside this file names a
 * Vezri image file: a screen asks for a pose and gets whatever art currently
 * represents it.
 *
 * `alt` describes the STATE, not the bird — a screen reader user needs "Vezri
 * is reading your plan", not "a pink falcon". It is only used where the image
 * stands alone; inside VezriWorking the visible stage line already says this,
 * so the image is decorative there and carries alt="".
 */
const POSES: Record<
  VezriPose,
  { src: string; width: number; height: number; alt: string }
> = {
  reading: {
    src: "/brand/vezri-reading.webp",
    width: 454,
    height: 760,
    alt: "Vezri is reading your plan",
  },
  thinking: {
    src: "/brand/vezri-thinking.webp",
    width: 357,
    height: 760,
    alt: "Vezri is working this out",
  },
  confused: {
    src: "/brand/vezri-confused.webp",
    width: 375,
    height: 760,
    alt: "Vezri ran into a problem",
  },
};

/**
 * Product state → pose. THE one place this mapping is decided.
 *
 * `confused` is reserved for genuine problems — something failed or was
 * rejected. It is deliberately absent from every state that follows a user
 * saying they did not do something: §13 requires the coach to be
 * non-judgmental, and a puzzled mascot holding a question mark at that moment
 * reads as disappointment however the copy is worded. `coachFailure` is
 * therefore `thinking` even though it is a real failure — the error text
 * carries the problem, and the drawing stays neutral.
 *
 * It is equally absent from the good empty states ("Nothing needs you today",
 * "Nothing outstanding", "Nothing structural is missing"). Being caught up is
 * not a problem, and it should not be illustrated as one.
 */
export const POSE_FOR = {
  /** §5 Step 3 — Vezri reads the uploaded or pasted plan. */
  readingPlan: "reading",
  /** §5 Step 6 — turning the confirmed target into an active plan. */
  buildingPlan: "thinking",
  /** §16 — the "What am I missing?" audit. */
  audit: "thinking",
  /** §15 — a Goal Health explanation. */
  goalHealth: "thinking",
  /** §13 — the coach working out the smallest way forward. */
  coach: "thinking",
  /** Extraction failed, the plan could not be read. */
  failure: "confused",
  /** §7 — the upload was rejected before anything was read. */
  uploadRejected: "confused",
  /** §13 — a coach failure. Never `confused`; see above. */
  coachFailure: "thinking",
} as const satisfies Record<string, VezriPose>;

/**
 * The state description for a pose, for callers that need a described image.
 *
 * Exported so nothing has to retype it — including the tests, which would
 * otherwise be asserting against their own copy rather than against what the
 * component actually renders.
 */
export function poseAlt(pose: VezriPose): string {
  return POSES[pose].alt;
}

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
  /** Quiet line under the stage text. */
  note?: string;
  className?: string;
}

const DEFAULT_NOTE = "This takes a few seconds.";

export default function VezriWorking({
  stages,
  pose = "thinking",
  stageMs = 6000,
  error = null,
  errorPose = "confused",
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
        <VezriPoseImage pose={errorPose} alt="" className="h-36 w-auto" />
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
    <div role="status" aria-live="polite" aria-busy="true" className={`${shell} ${className}`}>
      {/* Decorative: the stage line below is the accessible name for this
          state, and it is already in the live region. */}
      <span className="animate-vezri-bob">
        <VezriPoseImage pose={pose} alt="" priority className="h-36 w-auto" />
      </span>
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
