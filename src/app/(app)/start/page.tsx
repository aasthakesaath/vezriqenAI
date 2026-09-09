import type { Metadata } from "next";
import PlanIntake from "@/components/onboarding/PlanIntake";
import UnfinishedPlans from "@/components/app/UnfinishedPlans";
import { createClient } from "@/lib/supabase/server";
import { loadUnfinishedPlans } from "@/lib/plan/unfinished";
import { ONBOARDING_HEADING } from "@/lib/app-copy";

export const metadata: Metadata = { title: ONBOARDING_HEADING, robots: { index: false } };

export default async function StartPage() {
  const supabase = await createClient();
  const unfinished = await loadUnfinishedPlans({ supabase });

  return (
    <>
      {/* ABOVE the form here, unlike on My Goals. Someone standing on this
          page is about to bring in a plan, and four copies of one document
          accumulated in an evening because nothing told them a plan was
          already in progress. Offered, not enforced: a second goal from the
          same document is a legitimate thing to want. */}
      {unfinished.length > 0 && (
        <div className="shell max-w-2xl pt-10">
          <UnfinishedPlans
            plans={unfinished.map((plan) => ({
              goalId: plan.goalId,
              filename: plan.filename,
              pasted: plan.pasted,
              createdAt: plan.createdAt,
              progress: plan.progress,
              note: plan.note,
            }))}
          />
        </div>
      )}
      <PlanIntake />
    </>
  );
}
