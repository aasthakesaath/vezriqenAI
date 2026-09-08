"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * PRD §23 — deleting an uploaded document also removes everything derived from
 * it. The confirm step is deliberate: this is not undoable.
 */
export default function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/plans/${documentId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Couldn't delete that document.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-berry transition-colors hover:bg-blush-wash"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="text-right">
      <p className="text-sm text-mauve">Delete this document and everything from it?</p>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-mauve"
        >
          Keep
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-pill bg-berry px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
