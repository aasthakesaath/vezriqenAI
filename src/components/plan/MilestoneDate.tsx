"use client";

import { useState } from "react";
import { formatDayKey } from "@/lib/time";

/**
 * A milestone's date — or an invitation to give it one.
 *
 * Seventeen of thirty-four milestones in a real plan came back with no date,
 * and every one of them just said "No date" and sat there. They are not
 * mistakes: they are the items the document anchors to an event rather than a
 * day ("before the first workshop"), so Vezri is right not to invent one. But
 * §9's lead-time engine has nothing to work with until a date exists, which
 * means the milestone cannot be scheduled or scored — so the honest thing is
 * to say so, and make adding one a single click rather than a dead end.
 */
export default function MilestoneDate({
  milestoneId,
  date,
  label,
  dateAnchor,
}: {
  milestoneId: string;
  date: string | null;
  label: string | null;
  dateAnchor: string | null;
}) {
  const [value, setValue] = useState(date ?? "");
  const [saved, setSaved] = useState<string | null>(date);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value) return;
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/milestones/${milestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_date: value }),
    }).catch(() => null);
    setSaving(false);

    if (!response?.ok) {
      setError("That didn't save. Try again.");
      return;
    }
    setSaved(value);
    setEditing(false);
  }

  if (saved && !editing) {
    return (
      <span className="text-sm text-mauve-light">
        {label ?? formatDayKey(saved)}
        {dateAnchor && (
          // §7 — where an inferred date came from, in the user's own terms.
          <span className="ml-2 text-xs text-mauve-light">({dateAnchor})</span>
        )}
      </span>
    );
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2 text-sm text-mauve-light">
        No date yet
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-blush px-2 py-1 text-xs font-medium text-mauve underline decoration-rose underline-offset-2 hover:bg-blush-wash"
        >
          Add a date
        </button>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <label className="sr-only" htmlFor={`date-${milestoneId}`}>
        Target date for this milestone
      </label>
      <input
        id={`date-${milestoneId}`}
        type="date"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="rounded-lg border border-blush px-2 py-1 text-sm text-ink"
      />
      <button
        type="button"
        onClick={save}
        disabled={!value || saving}
        className="rounded-lg bg-rose px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Saving" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        className="text-xs text-mauve underline underline-offset-2"
      >
        Cancel
      </button>
      {error && (
        <span role="status" className="text-xs text-mauve">
          {error}
        </span>
      )}
    </span>
  );
}
