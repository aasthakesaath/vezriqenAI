"use client";

import { useState } from "react";

/**
 * PRD §5, §11, §23, §30.7 — Calendar is a separate, optional consent.
 *
 * The copy says so plainly, because the guarantee is only worth anything if the
 * user knows it: signing in did not grant this, and declining leaves everything
 * else working.
 */
export default function CalendarConnection({
  connected,
  googleEmail,
  configured,
  notice,
}: {
  connected: boolean;
  googleEmail: string | null;
  configured: boolean;
  notice: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/calendar/disconnect", { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't disconnect.");
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <section
      aria-labelledby="calendar-heading"
      className="rounded-2xl border border-blush bg-white p-6 shadow-soft"
    >
      <h2 id="calendar-heading" className="scroll-mt-24 text-lg font-semibold text-ink">
        Google Calendar
      </h2>
      <p className="mt-2 text-[0.98rem] leading-relaxed text-mauve">
        Connect your calendar and Vezri will plan around the time you actually have. This is
        separate from signing in — your sign-in didn&rsquo;t grant it, and you can skip it and
        still use everything else.
      </p>
      <p className="mt-2 text-sm text-mauve-light">
        Vezri reads when you&rsquo;re busy, not what you&rsquo;re doing, and only ever edits the
        blocks it created.
      </p>

      {notice === "declined" && (
        <p role="status" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          No problem — nothing has changed.
        </p>
      )}
      {notice === "partial" && (
        <p role="status" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          Some permissions weren&rsquo;t granted, so Vezri may not be able to add blocks. You can
          reconnect to change that.
        </p>
      )}
      {notice === "error" && (
        <p role="alert" className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm text-ink">
          That didn&rsquo;t work. Try connecting again.
        </p>
      )}

      {!configured ? (
        <p className="mt-4 rounded-xl bg-cream-light px-4 py-3 text-sm leading-relaxed text-ink">
          Calendar isn&rsquo;t configured in this environment yet. It needs its own Google Cloud
          project, separate from sign-in.
        </p>
      ) : connected ? (
        <div className="mt-5">
          <p className="text-[0.98rem] text-ink">
            Connected{googleEmail ? ` as ${googleEmail}` : ""}.
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="btn-secondary mt-4 disabled:opacity-60"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
          <p className="mt-3 text-sm text-mauve-light">
            Blocks Vezri already created stay on your calendar — they&rsquo;re yours to keep or
            remove.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-berry">
              {error}
            </p>
          )}
        </div>
      ) : (
        <form action="/api/calendar/start" method="post" className="mt-5">
          <button type="submit" className="btn-primary">
            Connect Google Calendar
          </button>
        </form>
      )}
    </section>
  );
}
