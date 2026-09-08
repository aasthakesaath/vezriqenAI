"use client";

import { useState } from "react";

const CONFIRMED = {
  done: "Recorded — nice one.",
  snooze: "Snoozed for a day.",
  stuck: "Noted. Nothing has been moved — open Vezriqen and Vezri will help you get unstuck.",
} as const;

/**
 * The POST half of the email action flow. The confirmation click is what makes
 * the change, so a prefetching mail client cannot check someone in for them.
 */
export default function RedeemConfirm({
  token,
  action,
}: {
  token: string;
  action: "done" | "snooze" | "stuck";
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setState("busy");
    const response = await fetch(`/api/reminders/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "Couldn't record that.");
      setState("error");
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <div className="mt-8">
        <p role="status" className="rounded-xl bg-blush-wash px-5 py-4 text-ink">
          {CONFIRMED[action]}
        </p>
        <a href="/today" className="btn-secondary mt-5">
          Open Vezriqen AI&trade;
        </a>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <button type="button" onClick={confirm} disabled={state === "busy"} className="btn-primary disabled:opacity-60">
        {state === "busy" ? "Recording…" : "Confirm"}
      </button>
      {message && (
        <p role="alert" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          {message}
        </p>
      )}
      <p className="mt-5 text-sm text-mauve-light">
        <a href="/today" className="underline">
          Or open Vezriqen AI&trade;
        </a>
      </p>
    </div>
  );
}
