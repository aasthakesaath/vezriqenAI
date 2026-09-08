"use client";

import { useState } from "react";

const TOPICS = ["Something is broken", "A suggestion", "A question", "Something else"] as const;

type Status = { kind: "idle" | "sending" | "sent" | "error"; message?: string };

const field =
  "mt-1.5 w-full rounded-xl border border-blush bg-white px-4 py-3 text-[0.98rem] text-ink placeholder:text-mauve-light/70 focus:border-berry";

export default function FeedbackForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const canSend = message.trim().length >= 10 && status.kind !== "sending";

  async function submit() {
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, email: email.trim(), message: message.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus({ kind: "error", message: data.error ?? "That didn't send. Try again." });
        return;
      }
      setStatus({ kind: "sent" });
      setMessage("");
      setEmail("");
    } catch {
      setStatus({ kind: "error", message: "That didn't send. Check your connection and try again." });
    }
  }

  if (status.kind === "sent") {
    return (
      <div
        role="status"
        className="mt-8 rounded-2xl border border-blush bg-blush-wash px-6 py-8 text-center"
      >
        <p className="text-lg font-semibold text-ink">Thanks &mdash; we got it.</p>
        <p className="mt-2 text-mauve">
          If you left an email address we&rsquo;ll reply when we have something useful to say.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="btn-secondary mt-6"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <div>
        <label htmlFor="fb-topic" className="text-sm font-semibold text-ink">
          What is this about?
        </label>
        <select
          id="fb-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={field}
        >
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="fb-email" className="text-sm font-semibold text-ink">
          Your email <span className="font-normal text-mauve-light">(optional)</span>
        </label>
        <input
          id="fb-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={field}
        />
        <p className="mt-1.5 text-sm text-mauve-light">Add it only if you want a reply.</p>
      </div>

      <div>
        <label htmlFor="fb-message" className="text-sm font-semibold text-ink">
          Your message
        </label>
        <textarea
          id="fb-message"
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby="fb-message-help"
          placeholder="What happened, or what would help?"
          className={`${field} resize-y`}
        />
        <p id="fb-message-help" className="mt-1.5 text-sm text-mauve-light">
          At least a sentence, so we know what to look at.
        </p>
      </div>

      {status.kind === "error" && (
        <p role="alert" className="rounded-xl bg-berry/10 px-4 py-3 text-sm font-medium text-berry-deep">
          {status.message}
        </p>
      )}

      <button type="button" onClick={submit} disabled={!canSend} className="btn-primary disabled:opacity-50">
        {status.kind === "sending" ? "Sending\u2026" : "Send feedback"}
      </button>
    </div>
  );
}
