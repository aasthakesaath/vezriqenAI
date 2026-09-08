"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { INTAKE_MODES, ONBOARDING_HEADING, type IntakeModeId } from "@/lib/app-copy";
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, MIN_PLAN_CHARS, humanFileSize } from "@/lib/ingest/limits";
import { goalReviewPath } from "@/lib/routes";
import { POSE_FOR, VezriPoseImage } from "@/components/VezriWorking";

/**
 * PRD §5 Step 2. Three ways in, one screen, no configuration.
 *
 * Client-side checks here are a courtesy that saves a 25 MB round trip; the
 * server re-validates everything and is the only authority (see
 * src/lib/ingest/validate.ts).
 */
export default function PlanIntake() {
  const router = useRouter();
  const [mode, setMode] = useState<IntakeModeId | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [planText, setPlanText] = useState("");
  const [goalText, setGoalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether the error is a REJECTION rather than a nudge.
   *
   * "Choose a file to upload" is a reminder that the form is incomplete;
   * "that file is 25 MB" or a server refusal is Vezri turning something away.
   * Only the second kind gets the confused pose — illustrating a missing
   * field as a problem would spend the drawing on nothing.
   */
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function chooseMode(next: IntakeModeId) {
    setMode(next);
    setError(null);
    setRejected(false);
  }

  function fail(message: string, wasRejected = false) {
    setError(message);
    setRejected(wasRejected);
    setBusy(false);
    // Move focus so a screen reader announces the problem immediately.
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || busy) return;

    if (mode === "upload") {
      if (!file) return fail("Choose a file to upload.");
      if (file.size > MAX_FILE_BYTES) {
        return fail(
          `That file is ${humanFileSize(file.size)}. The limit is ${humanFileSize(MAX_FILE_BYTES)}.`,
          true,
        );
      }
    }
    if (mode === "paste" && planText.trim().length < MIN_PLAN_CHARS) {
      return fail(`Paste a bit more of the plan — at least ${MIN_PLAN_CHARS} characters.`);
    }
    if (mode === "goal_only" && goalText.trim().length === 0) {
      return fail("Tell Vezri what you're trying to achieve.");
    }

    setBusy(true);
    setError(null);
    setRejected(false);

    const body = new FormData();
    body.set("mode", mode);
    body.set("goal_text", goalText);
    if (mode === "upload" && file) body.set("file", file);
    if (mode === "paste") body.set("plan_text", planText);

    try {
      const response = await fetch("/api/plans", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as {
        goal_id?: string;
        error?: string;
      };
      if (!response.ok || !payload.goal_id) {
        // The server is the authority on what it will accept (§7), so anything
        // it refuses is a real rejection.
        return fail(payload.error ?? "Something went wrong. Try again.", true);
      }
      router.push(goalReviewPath(payload.goal_id));
    } catch {
      return fail("Couldn't reach Vezriqen. Check your connection and try again.", true);
    }
  }

  return (
    <div className="shell max-w-2xl py-12 lg:py-16">
      <h1 className="text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {ONBOARDING_HEADING}
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-mauve">
        Bring the plan you already have. Vezri reads it and turns it into something you can follow.
      </p>

      <fieldset className="mt-8">
        <legend className="sr-only">How would you like to start?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {INTAKE_MODES.map((option) => {
            const selected = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseMode(option.id)}
                aria-pressed={selected}
                className={[
                  "rounded-2xl border px-5 py-4 text-left transition-colors",
                  option.emphasis === "secondary" ? "sm:col-span-2" : "",
                  selected
                    ? "border-berry bg-blush-wash ring-1 ring-berry"
                    : "border-blush bg-white hover:bg-blush-wash",
                ].join(" ")}
              >
                <span className="block font-semibold text-ink">{option.label}</span>
                <span className="mt-1 block text-sm leading-relaxed text-mauve">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {mode ? (
        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          {mode === "upload" && (
            <div>
              <label htmlFor="plan-file" className="text-sm font-semibold text-ink">
                Your plan
              </label>
              <input
                id="plan-file"
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink file:mr-3 file:rounded-pill file:border-0 file:bg-berry file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-white"
              />
              <p className="mt-1.5 text-sm text-mauve-light">
                PDF, Word, text, Markdown, JPG or PNG. Up to {humanFileSize(MAX_FILE_BYTES)}.
              </p>
            </div>
          )}

          {mode === "paste" && (
            <div>
              <label htmlFor="plan-text" className="text-sm font-semibold text-ink">
                Your plan
              </label>
              <textarea
                id="plan-text"
                rows={10}
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                placeholder="Paste the plan here — milestones, dates, whatever you already have."
                className="mt-1.5 w-full resize-y rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink placeholder:text-mauve-light/70 focus:border-berry"
              />
            </div>
          )}

          <div>
            <label htmlFor="goal-text" className="text-sm font-semibold text-ink">
              What&rsquo;s the goal?{" "}
              {mode !== "goal_only" && (
                <span className="font-normal text-mauve-light">(optional)</span>
              )}
            </label>
            <input
              id="goal-text"
              type="text"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="Pass the SAT in March"
              className="mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink placeholder:text-mauve-light/70 focus:border-berry"
            />
            <p className="mt-1.5 text-sm text-mauve-light">
              {mode === "goal_only"
                ? "Vezri will start something light you can build on."
                : "Only if it isn't already obvious from the plan."}
            </p>
          </div>

          {error && (
            <div
              className={
                rejected
                  ? "flex items-center gap-4 rounded-xl bg-cream-light px-4 py-3"
                  : undefined
              }
            >
              {rejected && (
                // Decorative: the alert beside it is the accessible message.
                <VezriPoseImage pose={POSE_FOR.uploadRejected} alt="" className="h-20 w-auto" />
              )}
              <p
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className={
                  rejected
                    ? "text-sm text-ink"
                    : "rounded-xl bg-cream-light px-4 py-3 text-sm text-ink"
                }
              >
                {error}
              </p>
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
            {busy ? "Reading your plan…" : "Continue"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
