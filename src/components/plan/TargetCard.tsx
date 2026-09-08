"use client";

import { useState } from "react";

export type TargetCardData = {
  goalId: string;
  normalizedGoal: string;
  targetDate: string | null;
  successCriteria: string[];
  constraints: string[];
  feasibilityNote?: string | null;
};

/**
 * PRD §5 Step 5 — "Show one simple card." Outcome, target date, how success is
 * measured, important constraints, then Looks right / Adjust.
 *
 * §6 requires the user to be able to override Vezri, so Adjust edits the target
 * in place rather than sending them back to re-upload anything. Deliberately
 * not a five-field SMART form (§6: "The user should not need to fill in five
 * SMART fields").
 */
export default function TargetCard({
  data,
  onConfirmed,
}: {
  data: TargetCardData;
  onConfirmed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(data.normalizedGoal);
  const [targetDate, setTargetDate] = useState(data.targetDate ?? "");
  const [criteria, setCriteria] = useState(data.successCriteria.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/goals/${data.goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        normalized_goal: goal.trim(),
        target_date: targetDate ? targetDate : null,
        success_criteria: criteria
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't save that change.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setEditing(false);
  }

  return (
    <section
      aria-labelledby="target-heading"
      className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
    >
      <h2 id="target-heading" className="text-sm font-semibold uppercase tracking-wide text-berry">
        Your Target
      </h2>

      {editing ? (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="target-goal" className="text-sm font-semibold text-ink">
              Outcome
            </label>
            <textarea
              id="target-goal"
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="mt-1.5 w-full resize-y rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink focus:border-berry"
            />
          </div>
          <div>
            <label htmlFor="target-date" className="text-sm font-semibold text-ink">
              Target date
            </label>
            <input
              id="target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink focus:border-berry"
            />
          </div>
          <div>
            <label htmlFor="target-criteria" className="text-sm font-semibold text-ink">
              How success will be measured
            </label>
            <textarea
              id="target-criteria"
              rows={4}
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              className="mt-1.5 w-full resize-y rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink focus:border-berry"
            />
            <p className="mt-1.5 text-sm text-mauve-light">One measure per line.</p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={save} disabled={busy} className="btn-primary disabled:opacity-60">
              {busy ? "Saving…" : "Save target"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xl font-semibold leading-snug text-ink">{data.normalizedGoal}</p>

          <dl className="mt-5 space-y-4 text-[0.98rem]">
            <div>
              <dt className="text-sm font-semibold text-ink">Target date</dt>
              <dd className="mt-0.5 text-mauve">
                {data.targetDate ?? "Not set yet — Vezri will ask."}
              </dd>
            </div>
            {data.successCriteria.length > 0 && (
              <div>
                <dt className="text-sm font-semibold text-ink">How success will be measured</dt>
                <dd className="mt-1">
                  <ul className="list-disc space-y-1 pl-5 text-mauve">
                    {data.successCriteria.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {data.constraints.length > 0 && (
              <div>
                <dt className="text-sm font-semibold text-ink">Important constraints</dt>
                <dd className="mt-1">
                  <ul className="list-disc space-y-1 pl-5 text-mauve">
                    {data.constraints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>

          {/* §6 — flag a stretched timeline without claiming impossibility. */}
          {data.feasibilityNote && (
            <p className="mt-5 rounded-xl bg-cream-light px-4 py-3 text-sm leading-relaxed text-ink">
              {data.feasibilityNote}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={onConfirmed} className="btn-primary">
              Looks right
            </button>
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary">
              Adjust
            </button>
          </div>
        </>
      )}
    </section>
  );
}
