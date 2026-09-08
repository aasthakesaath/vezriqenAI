import type { Metadata } from "next";
import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { APP_ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Today", robots: { index: false } };

/**
 * PRD §17. Milestone 4 builds the priority cards, goal health summaries and
 * notification centre; this is the landing surface they attach to.
 */
export default async function TodayPage() {
  const user = await getUser();
  const supabase = await createClient();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, user_goal_text, normalized_goal, status")
    .order("created_at", { ascending: false });

  const firstName =
    ((user?.user_metadata?.full_name ?? user?.user_metadata?.name) as string | undefined)?.split(
      " ",
    )[0] ?? null;

  return (
    <div className="shell max-w-3xl py-12 lg:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {firstName ? `Good morning, ${firstName}` : "Good morning"}
      </h1>

      {goals && goals.length > 0 ? (
        <ul className="mt-8 space-y-3">
          {goals.map((goal) => (
            <li key={goal.id}>
              <Link
                href={`${APP_ROUTES.goals}/${goal.id}/review`}
                className="block rounded-2xl border border-blush bg-white p-5 shadow-soft transition-colors hover:bg-blush-wash"
              >
                <span className="block font-semibold text-ink">
                  {goal.normalized_goal || goal.user_goal_text || "Untitled goal"}
                </span>
                <span className="mt-1 block text-sm text-mauve">{goal.status.replace(/_/g, " ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 rounded-2xl border border-blush bg-white p-6 shadow-soft">
          <p className="text-mauve">You don&rsquo;t have a goal yet.</p>
          <Link href={APP_ROUTES.start} className="btn-primary mt-4">
            Bring Vezri a plan
          </Link>
        </div>
      )}
    </div>
  );
}
