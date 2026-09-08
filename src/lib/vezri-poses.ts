/**
 * Vezri's poses, and which product state gets which.
 *
 * A PLAIN module, deliberately — not part of VezriWorking.tsx, which is
 * "use client". Next.js replaces a client module's exports with client
 * references in the server bundle, so a server component importing POSE_FOR
 * from there got `undefined`, and `POSES[undefined].src` threw:
 *
 *   TypeError: Cannot read properties of undefined (reading 'src')
 *     at /today, /goals, /goals/[id], /settings
 *
 * Four server pages were doing exactly that. The unit tests did not catch it
 * because vitest imports the module directly, with no client-reference
 * transform: it only fails once Next has built it. Constants live here so both
 * sides can import them for real.
 */

export type VezriPose = "reading" | "thinking" | "confused";

/**
 * The three poses and their intrinsic sizes.
 *
 * `alt` describes the STATE, not the bird — a screen reader user needs "Vezri
 * is reading your plan", not "a pink falcon". It is only used where the image
 * stands alone; inside a waiting card the visible stage line already says it,
 * so the image is decorative there and carries alt="".
 */
export const POSES: Record<
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
 * Product state → pose. THE one place this is decided.
 *
 * `confused` is reserved for genuine problems. It is deliberately absent from
 * every state that follows a user saying they did not do something: §13
 * requires the coach to be non-judgmental, and a puzzled mascot holding a
 * question mark at that moment reads as disappointment however the copy is
 * worded. `coachFailure` is therefore `thinking` even though it is a real
 * failure — the error text carries the problem, the drawing stays neutral.
 *
 * It is equally absent from the good empty states ("Nothing needs you today",
 * "Nothing outstanding"). Being caught up is not a problem.
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

/** The state description for a pose, for callers that need a described image. */
export function poseAlt(pose: VezriPose): string {
  return POSES[pose].alt;
}
