import type { AIFailureKind } from "./provider";

/**
 * What to tell someone when a model call fails, per screen.
 *
 * THE BUG THIS EXISTS FOR. A billing failure — our credit balance, nothing to
 * do with the user — reached the "I'm stuck" panel as:
 *
 *   "Vezri couldn't work with that plan. Try a clearer version, or paste the
 *    plan text."
 *
 * Wrong on three counts. There is no plan on that panel; the user had typed
 * nothing that could be "clearer"; and no edit they could make would have
 * fixed an unpaid invoice. It happened because the provider wrote the
 * user-facing sentence itself, and the only caller it knew about when those
 * sentences were written was plan extraction. Every later surface inherited
 * copy about documents.
 *
 * So the provider now reports a KIND and this module owns the words. Two rules
 * decide the table below, and they are the whole design:
 *
 *   1. A failure on OUR side gets the same sentence everywhere, because the
 *      screen the user happens to be on has nothing to do with it. Saying
 *      "try a clearer version" to someone whose request never reached the
 *      model is worse than saying nothing — it sends them to edit input that
 *      was never the problem.
 *   2. A failure about what WE SENT gets per-surface wording, because that is
 *      the only case where the thing at fault differs by screen: a 60-page
 *      document on the extraction screen, one task's title on a card.
 *
 * Nothing here mentions how late anything is, and nothing invents a cause.
 */

/**
 * Which screen is asking. Each has its own words for an input-side failure.
 *
 * These three are the surfaces that SHOW a message. /api/tasks/[id]/block,
 * /api/tasks/[id]/replan and /api/goals/[id]/audit deliberately swallow an AI
 * failure and fall back to deterministic output instead — §13 requires the
 * coach to work without a model at all — so they render no copy and have
 * none here. If one of them ever starts showing a failure, it gets a surface
 * of its own rather than borrowing another screen's words, which is the
 * mistake this module exists to undo.
 */
export type AISurface =
  /** Reading a plan the user uploaded or pasted (PRD §5, §7). */
  | "extraction"
  /** "I'm stuck": the obstacle, one action, the breakdown (§13). */
  | "unblock"
  /** The how-to steps on a task card (§13). */
  | "guidance";

/**
 * Failures that are ours, worded the same on every screen.
 *
 * `billing` is the one this module was written for. It says plainly that the
 * service is unavailable, says whose problem it is, and does not invite a
 * retry that cannot succeed — §4.6's "no guilt" applied to the machine as much
 * as to the person: do not imply the user did something wrong.
 */
const OUR_FAULT: Record<string, string> = {
  not_configured:
    "Vezri's AI service isn't switched on yet. That's a setup job on our side — nothing you can do from here.",
  unauthorised:
    "Vezri can't get into its AI service right now. That's a problem on our side, and trying again won't move it.",
  billing:
    "Vezri's AI service is unavailable right now. That's a billing problem on our side — nothing you've written caused it, and nothing you change will fix it. Please try again later.",
  not_found:
    "Vezri asked its AI service for something it no longer offers. That's a problem on our side, not with anything you entered.",
  rate_limited: "Vezri is handling a lot at the moment. Try again in a minute.",
  overloaded: "Vezri's AI service is busy right now. Try again in a moment.",
  unavailable: "Vezri couldn't reach its AI service. Try again in a moment.",
};

/**
 * Failures about what we sent, in each screen's own terms.
 *
 * Only these four are surface-specific, and only because the thing at fault
 * genuinely differs: a document, a goal's plan, or one task.
 */
const PER_SURFACE: Record<AISurface, Record<string, string>> = {
  extraction: {
    timed_out:
      "That took longer than Vezri could wait. Try again — a large plan can need a second run.",
    too_large: "That plan is larger than Vezri can read in one go. Try the plan section on its own.",
    bad_request:
      "Vezri couldn't work with that plan. Try a clearer version, or paste the plan text.",
    unusable_output:
      "Vezri read the document but couldn't turn it into a plan. Try a clearer version, or paste the plan text.",
    truncated: "That plan is larger than Vezri can read in one pass.",
  },
  unblock: {
    timed_out: "That took longer than Vezri could wait. Try again.",
    too_large: "There's more here than Vezri can work through at once.",
    bad_request: "Vezri couldn't work out what's in the way just now.",
    unusable_output: "Vezri couldn't work out what's in the way just now. Try again.",
    truncated: "Vezri ran out of room before it finished. Try again.",
  },
  guidance: {
    timed_out: "That took longer than Vezri could wait. Try again.",
    too_large: "There's more in this task than Vezri can break down at once.",
    bad_request: "Vezri couldn't write the steps for this one just now.",
    unusable_output: "Vezri couldn't write usable steps just now. Try again.",
    truncated: "Vezri ran out of room before it finished the steps. Try again.",
  },
};

/**
 * The sentence to show, for this kind, on this screen.
 *
 * Our-fault kinds win over the per-surface table, so a screen cannot
 * accidentally blame its own input for something that never reached the model
 * — which is exactly what went wrong.
 */
export function aiFailureMessage(surface: AISurface, kind: AIFailureKind): string {
  return (
    OUR_FAULT[kind] ??
    PER_SURFACE[surface][kind] ??
    // Neither table knows this kind, which means a kind was added without a
    // decision about what to say. Neutral, and never blames the input.
    "Vezri couldn't finish that just now. Try again in a moment."
  );
}

/**
 * Whether offering a "Try again" button is honest.
 *
 * A retry has to be able to succeed WITHOUT the user changing anything. That
 * rules out every our-fault kind a retry cannot clear — an unpaid balance, a
 * bad credential, a model we no longer have — and it rules out the two that
 * are about what we sent, since sending it again sends the same thing.
 *
 * Getting this wrong in the generous direction is not a small thing: a button
 * that cannot work invites someone to press it until they give up, and it
 * implies the failure was theirs to fix.
 */
const NO_RETRY: ReadonlySet<string> = new Set([
  "not_configured",
  "unauthorised",
  "billing",
  "not_found",
  "too_large",
  "bad_request",
]);

export function isRetryableFailure(kind: AIFailureKind): boolean {
  return !NO_RETRY.has(kind);
}

/**
 * The HTTP status a route should answer with.
 *
 * 503 for our fault, so it never reads as the caller's; 502 for a model that
 * answered with something unusable; 422 for something genuinely wrong with
 * what was sent.
 */
export function aiFailureStatus(kind: AIFailureKind): number {
  if (kind === "bad_request" || kind === "too_large") return 422;
  if (kind in OUR_FAULT) return 503;
  return 502;
}
