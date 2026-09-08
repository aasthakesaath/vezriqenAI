import type { Metadata } from "next";
import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadToday } from "@/lib/plan/load-today";
import { groupByMilestone } from "@/lib/plan/today";
import TodayList, { type TodayGroupView } from "@/components/app/TodayList";
import { VezriPoseImage, POSE_FOR } from "@/components/VezriWorking";
import { goalLabel } from "@/lib/goal-label";
import { APP_ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Today", robots: { index: false } };

/**
 * PRD §17. Up to three priority actions across ALL goals, then what is waiting
 * on someone else. Deliberately not a backlog, and deliberately cross-goal:
 * §4 exists to avoid the task-manager experience of checking each goal in turn
 * to find out what today needs.
 */
export default async function TodayPage() {
  const user = await getUser();
  const supabase = await createClient();
  const { cards, waitingOn, backlog, goals, reminderFor } = await loadToday({ supabase });

  const firstName =
    ((user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined)?.split(
      " ",
    )[0] ?? null;

  const groups: TodayGroupView[] = groupByMilestone(cards).map((group, index) => ({
    key: `${group.goalId}-${index}`,
    goalId: group.goalId,
    goalLabel: goalLabel({ short_label: group.goalLabel, normalized_goal: group.cards[0]?.goalTitle }),
    milestoneTitle: group.milestoneTitle,
    cards: group.cards.map((card) => ({
      id: card.id,
      goalId: card.goalId,
      goalLabel: goalLabel({ short_label: card.goalLabel, normalized_goal: card.goalTitle }),
      milestoneTitle: card.milestoneTitle ?? null,
      title: card.title,
      reason: card.reason,
      estimatedMinutes: card.estimatedMinutes,
      startBy: card.startBy?.toISOString() ?? null,
      deadline: card.deadline?.toISOString() ?? null,
      reminderId: reminderFor?.get(card.id) ?? null,
      waitingOn: card.externalPartyName ?? null,
    })),
  }));

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {firstName ? `Good morning, ${firstName}` : "Good morning"}
          </h1>

          {/* §4 — said ONCE, here, rather than on every card. Three cards each
              repeating "this should already have started" is the same reproach
              three times over, which is how a screen full of overdue work ends
              up reading as a telling-off. Neutral wording, and no exclamation. */}
          {backlog.planBehind && (
            <p className="mt-3 text-[1.02rem] leading-relaxed text-mauve">
              {backlog.behindCount} things are past the date Vezri worked back to. That happens
              — here are the ones worth picking up first.
            </p>
          )}
        </div>

        {/* Calm and neutral: a cheerful mascot on a screen full of overdue work
            is the wrong note, and §13 rules out the confused pose here too. */}
        <VezriPoseImage
          pose={POSE_FOR.goalHealth}
          alt=""
          className="h-16 w-auto shrink-0 sm:h-24"
        />
      </div>

      {goals.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <p className="text-mauve">You don&rsquo;t have an active goal yet.</p>
          <Link href={APP_ROUTES.start} className="btn-primary mt-5">
            Bring Vezri a plan
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-semibold text-ink">Your most important moves today</h2>
          <TodayList groups={groups} />

          {/* §13 — work that isn't in the user's control, kept visible but out
              of the priority slots. A name only: §3 puts invitations, accounts
              for other people and assignment in Phase 2. */}
          {waitingOn.length > 0 && (
            <section aria-labelledby="waiting-heading" className="mt-12">
              <h2 id="waiting-heading" className="text-lg font-semibold text-ink">
                Waiting on someone else
              </h2>
              <ul className="mt-3 space-y-2">
                {waitingOn.map((task) => (
                  <li key={task.id} className="rounded-xl bg-blush-wash px-5 py-4">
                    <p className="font-medium text-ink">{task.title}</p>
                    {task.externalPartyName && (
                      <p className="mt-0.5 text-sm text-mauve">
                        <span className="font-medium">Waiting on:</span> {task.externalPartyName}
                      </p>
                    )}
                    <p className="mt-0.5 text-sm text-mauve-light">
                      {goalLabel({ short_label: task.goalLabel, normalized_goal: task.goalTitle })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-12">
            <Link href={APP_ROUTES.goals} className="btn-secondary">
              See all your goals
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
