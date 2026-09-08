import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { APP_ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Reminders", robots: { index: false } };

/**
 * In-app reminder centre (PRD §12).
 *
 * Browser push is explicitly not required in Phase 1, so this is the reliable
 * channel — and the one email supplements rather than replaces. An unanswered
 * checkpoint shows as unconfirmed, never as done: §12 forbids assuming
 * completion from silence.
 */
export default async function RemindersPage() {
  const supabase = await createClient();

  const { data: reminders } = await supabase
    .from("reminders")
    .select(
      "id, type, channel, scheduled_at, response_required, response, responded_at, delivery_status, tasks(id, title, goal_id)",
    )
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: false })
    .limit(50);

  const rows = reminders ?? [];
  const open = rows.filter((r) => r.response_required && r.response === null);
  const answered = rows.filter((r) => !r.response_required || r.response !== null);

  const taskOf = (value: unknown) => {
    const task = Array.isArray(value) ? value[0] : value;
    return task as { id: string; title: string; goal_id: string } | null;
  };

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <Link href={APP_ROUTES.today} className="text-sm font-medium text-berry hover:underline">
        ← Today
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Reminders</h1>

      <section aria-labelledby="open-heading" className="mt-8">
        <h2 id="open-heading" className="text-lg font-semibold text-ink">
          Waiting on your answer
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-mauve">Nothing outstanding.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {open.map((reminder) => {
              const task = taskOf(reminder.tasks);
              return (
                <li
                  key={reminder.id}
                  className="rounded-xl border border-blush bg-white px-5 py-4 shadow-soft"
                >
                  <p className="font-medium text-ink">{task?.title ?? "A task"}</p>
                  <p className="mt-0.5 text-sm text-mauve">
                    Asked{" "}
                    {new Date(reminder.scheduled_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {/* §12 — never assume completion from silence. */}
                    Unconfirmed
                  </p>
                  <Link
                    href={APP_ROUTES.today}
                    className="mt-2 inline-block text-sm font-medium text-berry hover:underline"
                  >
                    Tell Vezri what happened
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading" className="mt-10">
        <h2 id="history-heading" className="text-lg font-semibold text-ink">
          Earlier
        </h2>
        {answered.length === 0 ? (
          <p className="mt-3 text-mauve">Nothing yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {answered.map((reminder) => {
              const task = taskOf(reminder.tasks);
              return (
                <li key={reminder.id} className="rounded-xl bg-blush-wash px-5 py-3">
                  <span className="text-ink">{task?.title ?? "A task"}</span>
                  <span className="ml-2 text-sm text-mauve">
                    {reminder.response ? reminder.response.replace(/_/g, " ") : "heads-up"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
