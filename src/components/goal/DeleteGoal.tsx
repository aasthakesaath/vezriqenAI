"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { confirmsDeletion, DELETE_PHRASE } from "@/lib/delete-confirmation";

/**
 * Deleting a goal (PRD §23), which the product promised and never offered.
 *
 * The same shape as account deletion, for the same reason: a goal carries its
 * milestones, its tasks, its check-ins and the document it was read from, and
 * none of that comes back. So it sits at the foot of the page in its own
 * section, the first press only reveals what goes, and the confirm button is
 * dead until the phrase is typed.
 *
 * It is not in the goal header and not in the card on /goals. A destructive
 * control belongs where someone arrives deliberately, not beside the thing
 * they open every day.
 */
export default function DeleteGoal({ goalId, label }: { goalId: string; label: string }) {
  const router = useRouter();
  const inputId = useId();
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = confirmsDeletion(phrase);

  async function remove() {
    if (!ready) return;
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/goals/${goalId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: phrase.trim() }),
    }).catch(() => null);

    if (!response || !response.ok) {
      const payload = (await response?.json().catch(() => ({}))) ?? {};
      setError((payload as { error?: string }).error ?? "Couldn't delete this goal.");
      setBusy(false);
      return;
    }

    // This page is about a goal that no longer exists, so replace it rather
    // than push — Back must not return to a 404 of the thing just deleted.
    router.replace("/goals");
    router.refresh();
  }

  return (
    <section
      aria-labelledby="delete-goal-heading"
      className="mt-8 rounded-3xl border border-berry/30 bg-white p-5 shadow-soft sm:p-6"
    >
      <h2 id="delete-goal-heading" className="text-lg font-semibold text-ink">
        Delete this goal
      </h2>

      {!confirming ? (
        <>
          <p className="mt-2 text-mauve">
            Permanently deletes this goal and everything in it. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 rounded-pill border border-berry px-5 py-2.5 text-sm font-semibold text-berry transition-colors hover:bg-blush-wash"
          >
            Delete goal
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-mauve">
            This deletes <span className="font-semibold text-ink">{label}</span> permanently, with
            its milestones, tasks, reminders, check-ins and the plan documents it was built from —
            including the uploaded files themselves. Your other goals are untouched.
          </p>

          <label htmlFor={inputId} className="mt-5 block text-sm font-medium text-ink">
            Type <span className="font-semibold text-berry">{DELETE_PHRASE}</span> to confirm
          </label>
          <input
            id={inputId}
            type="text"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            className="mt-2 w-full max-w-xs rounded-xl border border-blush bg-white px-4 py-2.5 text-ink focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/30"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setPhrase("");
                setError(null);
              }}
              disabled={busy}
              className="rounded-pill border border-blush px-5 py-2.5 text-sm font-semibold text-mauve transition-colors hover:bg-blush-wash disabled:opacity-60"
            >
              Keep this goal
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={!ready || busy}
              className="rounded-pill bg-berry px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete this goal"}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm text-berry">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
