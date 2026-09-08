"use client";

import { useState } from "react";
import VezriWorking, { POSE_FOR } from "@/components/VezriWorking";
import { AUDIT_LABEL, AUDIT_STEPS } from "@/lib/app-copy";

type AuditGap = { title: string; explanation: string; category: string };
type AuditResponse = { gaps: AuditGap[]; next_move: string | null };

/**
 * PRD §16 — "A visible button on every goal."
 *
 * Returns at most three gaps and one next move. The gaps are missing
 * requirements, not unfinished tasks; the empty state says so explicitly so the
 * user can tell the difference between "nothing missing" and "nothing overdue".
 */
export default function AuditPanel({ goalId }: { goalId: string }) {
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/goals/${goalId}/audit`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't run that audit.");
      setBusy(false);
      return;
    }
    setResult((await response.json()) as AuditResponse);
    setBusy(false);
  }

  return (
    <section
      aria-labelledby="audit-heading"
      className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="audit-heading" className="text-lg font-semibold text-ink">
          {AUDIT_LABEL}
        </h2>
        <button type="button" onClick={run} disabled={busy} className="btn-secondary disabled:opacity-60">
          {busy ? "Checking…" : result ? "Check again" : "Check my plan"}
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-mauve">
        Vezri looks for things your plan needs that nothing is producing — not just work
        that&rsquo;s behind.
      </p>

      {(busy || error) && (
        <VezriWorking
          className="mt-5"
          stages={[AUDIT_STEPS[0]]}
          pose={POSE_FOR.audit}
          error={error}
          errorPose={POSE_FOR.failure}
          onRetry={error ? () => void run() : undefined}
        />
      )}

      {result && (
        <div className="mt-5 border-t border-blush pt-5" aria-live="polite">
          {result.gaps.length === 0 ? (
            <p className="text-mauve">
              Nothing structural is missing. Everything your plan needs has something producing it.
            </p>
          ) : (
            <ul className="space-y-4">
              {result.gaps.map((gap) => (
                <li key={gap.title}>
                  <p className="font-medium text-ink">{gap.title}</p>
                  <p className="mt-0.5 text-[0.95rem] leading-relaxed text-mauve">
                    {gap.explanation}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {result.next_move && (
            <p className="mt-5 rounded-xl bg-blush-wash px-4 py-3 text-[0.98rem] leading-relaxed text-ink">
              <span className="font-semibold">Your highest-value next move:</span>{" "}
              {result.next_move}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
