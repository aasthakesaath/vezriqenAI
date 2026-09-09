"use client";

import { useId, useState } from "react";
import { confirmsDeletion, DELETE_PHRASE } from "@/lib/delete-confirmation";

/**
 * Deleting the account (PRD §23), which /privacy and /terms both promise.
 *
 * Three deliberate frictions, in order of how much they matter:
 *
 *   * It is the last thing on the page, in its own bordered section, and it
 *     is the only control here that is not a setting. Nothing above it can be
 *     mis-hit into this.
 *   * Nothing happens on the first press. The first press only reveals what
 *     is about to be deleted, itemised — a dialog that says "are you sure"
 *     asks a question the person cannot answer without that list.
 *   * The confirm button is dead until the phrase is typed. A press cannot be
 *     the whole gesture, because a press is what a mis-tap produces.
 *
 * Irreversible, and worded as such. There is no undo behind this and no
 * grace period, so the copy does not imply one.
 */

/** What goes, said in the user's terms rather than in table names. */
const REMOVED = [
  "your goals, milestones and tasks",
  "every plan document you uploaded, including the stored files",
  "your check-ins, reminders and execution history",
  "your Google Calendar connection and its saved tokens",
  "your profile and your sign-in itself",
];

export default function DeleteAccount() {
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

    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: phrase.trim() }),
    }).catch(() => null);

    if (!response || !response.ok) {
      const payload = (await response?.json().catch(() => ({}))) ?? {};
      setError((payload as { error?: string }).error ?? "Couldn't delete your account.");
      setBusy(false);
      return;
    }

    // A hard navigation, not router.push: the session this page was rendered
    // with no longer exists, and every cached server component under it is
    // now about a user who is gone.
    window.location.assign("/?deleted=1");
  }

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="mt-12 rounded-2xl border border-berry/30 bg-white p-5 shadow-soft sm:p-6"
    >
      <h2 id="delete-account-heading" className="scroll-mt-24 text-lg font-semibold text-ink">
        Delete account
      </h2>

      {!confirming ? (
        <>
          <p className="mt-2 text-mauve">
            Permanently deletes your account and everything in it. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 rounded-pill border border-berry px-5 py-2.5 text-sm font-semibold text-berry transition-colors hover:bg-blush-wash"
          >
            Delete account
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-mauve">This deletes, permanently and immediately:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-mauve">
            {REMOVED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-mauve">
            There is no undo and no grace period. Signing up again later starts an empty account,
            not this one.
          </p>

          <label htmlFor={inputId} className="mt-5 block text-sm font-medium text-ink">
            Type <span className="font-semibold text-berry">{DELETE_PHRASE}</span> to
            confirm
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
            className="mt-2 w-full max-w-xs rounded-xl border border-blush bg-white px-4 py-2.5 text-ink placeholder:text-mauve-light focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/30"
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
              Keep my account
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={!ready || busy}
              className="rounded-pill bg-berry px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete my account"}
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
