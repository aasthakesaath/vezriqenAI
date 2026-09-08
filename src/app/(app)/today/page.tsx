import type { Metadata } from "next";
import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadToday } from "@/lib/plan/load-today";
import { loadGoalSnapshot } from "@/lib/health/load";
import TodayList, { type TodayCardView } from "@/components/app/TodayList";
import { HEALTH_LABELS } from "@/lib/app-copy";
import { APP_ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Today", robots: { index: false } };

/**
 * PRD §17. Up to three priority actions, then goal health summaries and
 * upcoming critical deadlines. Deliberately not a backlog.
 */
export default async function TodayPage() {
  const user = await getUser();
  const supabase = await createClient();
  const { cards, waitingOn, goals, reminderFor } = await loadToday({ supabase });

  const firstName =
    ((user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined)?.split(
      " ",
    )[0] ?? null;

  const views: TodayCardView[] = cards.map((card) => ({
    id: card.id,
    goalId: card.goalId,
    goalTitle: card.goalTitle,
    title: card.title,
    reason: card.reason,
    estimatedMinutes: card.estimatedMinutes,
    startBy: card.startBy?.toISOString() ?? null,
    deadline: card.deadline?.toISOString() ?? null,
    reminderId: reminderFor?.get(card.id) ?? null,
  }));

  // Health summaries for the goals below the fold.
  const snapshots = await Promise.all(
    (goals ?? []).map((goal) => loadGoalSnapshot({ supabase, goalId: goal.id })),
  );

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {firstName ? `Good morning, ${firstName}` : "Good morning"}
      </h1>

      {goals.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <p className="text-mauve">You don&rsquo;t have an active goal yet.</p>
          <Link href={APP_ROUTES.start} className="btn-primary mt-5">
            Bring Vezri a plan
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-semibold text-ink">
            Your most important moves today
          </h2>
          <TodayList cards={views} />

          {/* §13 — work that isn't in the user's control, kept visible but
              out of the priority slots. */}
          {waitingOn.length > 0 && (
            <section aria-labelledby="waiting-heading" className="mt-10">
              <h2 id="waiting-heading" className="text-lg font-semibold text-ink">
                Waiting on someone else
              </h2>
              <ul className="mt-3 space-y-2">
                {waitingOn.map((task) => (
                  <li key={task.id} className="rounded-xl bg-blush-wash px-5 py-4">
                    <span className="font-medium text-ink">{task.title}</span>
                    <p className="mt-0.5 text-sm text-mauve">{task.goalTitle}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="goals-heading" className="mt-10">
            <h2 id="goals-heading" className="text-lg font-semibold text-ink">
              Your goals
            </h2>
            <ul className="mt-3 space-y-2">
              {snapshots.filter(Boolean).map((snapshot) => (
                <li key={snapshot!.goal.id}>
                  <Link
                    href={`${APP_ROUTES.goals}/${snapshot!.goal.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blush bg-white px-5 py-4 shadow-soft transition-colors hover:bg-blush-wash"
                  >
                    <span className="font-medium text-ink">
                      {snapshot!.goal.normalized_goal ??
                        snapshot!.goal.user_goal_text ??
                        "Your goal"}
                    </span>
                    <span className="text-sm text-mauve">
                      {HEALTH_LABELS[snapshot!.health.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
