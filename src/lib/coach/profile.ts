import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Execution Profile (PRD §10).
 *
 * Learned from what the user actually did, never from a questionnaire, and
 * never expressed as a judgement. §10 is explicit: "Do not label the user
 * 'lazy,' 'undisciplined,' 'procrastinator,' etc." So the profile stores
 * observations — when work gets done, which barriers recur, which
 * interventions were accepted — and nothing that reads as a verdict.
 */

export type LearnedProfile = {
  completion_by_time: Record<string, { completed: number; total: number }>;
  snooze_patterns: { snoozes: number; checkIns: number };
  estimate_accuracy: { samples: number; medianRatio: number | null };
  common_blocks: Record<string, number>;
  effective_interventions: Record<string, { accepted: number; offered: number }>;
  profile_confidence: number;
};

/** Morning / afternoon / evening from an hour, matching §10's own buckets. */
export function windowForHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/**
 * Confidence grows with evidence and saturates — one good week should not make
 * Vezri certain about someone.
 */
function confidenceFor(observations: number): number {
  return Math.min(1, Math.round((observations / (observations + 12)) * 100) / 100);
}

/**
 * Recomputes the profile from scratch.
 *
 * Full recompute rather than incremental update: the volumes are small, and a
 * derived value that can drift out of step with its source is a bug waiting to
 * happen.
 */
export async function recomputeExecutionProfile(options: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<LearnedProfile> {
  const { supabase, userId } = options;

  const [{ data: checkIns }, { data: blocks }, { data: reminders }] = await Promise.all([
    supabase
      .from("check_ins")
      .select("state, created_at, task_id")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("execution_blocks")
      .select("category, intervention_type, accepted")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("reminders")
      .select("response, response_required, sent_at")
      .eq("response_required", true)
      .limit(500),
  ]);

  const rows = checkIns ?? [];

  // When does work actually get finished?
  const completionByTime: LearnedProfile["completion_by_time"] = {};
  for (const row of rows) {
    const bucket = windowForHour(new Date(row.created_at).getUTCHours());
    completionByTime[bucket] ??= { completed: 0, total: 0 };
    completionByTime[bucket]!.total += 1;
    if (row.state === "done") completionByTime[bucket]!.completed += 1;
  }

  const snoozes = rows.filter((r) => r.state === "snoozed").length;

  // Which barriers recur. §13 uses this to prefer interventions that fit the
  // person, not just the moment.
  const commonBlocks: Record<string, number> = {};
  for (const block of blocks ?? []) {
    commonBlocks[block.category] = (commonBlocks[block.category] ?? 0) + 1;
  }

  // Which interventions this person actually takes up (§24 intervention success).
  const effective: LearnedProfile["effective_interventions"] = {};
  for (const block of blocks ?? []) {
    if (!block.intervention_type) continue;
    effective[block.intervention_type] ??= { accepted: 0, offered: 0 };
    effective[block.intervention_type]!.offered += 1;
    if (block.accepted) effective[block.intervention_type]!.accepted += 1;
  }

  const answered = (reminders ?? []).filter((r) => r.response !== null).length;

  const profile: LearnedProfile = {
    completion_by_time: completionByTime,
    snooze_patterns: { snoozes, checkIns: rows.length },
    // Actual-vs-estimated needs timed sessions, which arrive with calendar
    // blocks. Reporting zero samples is honest; inventing a ratio is not.
    estimate_accuracy: { samples: 0, medianRatio: null },
    common_blocks: commonBlocks,
    effective_interventions: effective,
    profile_confidence: confidenceFor(rows.length + (blocks?.length ?? 0) + answered),
  };

  await supabase
    .from("execution_profiles")
    .update({
      completion_by_time: profile.completion_by_time,
      snooze_patterns: profile.snooze_patterns,
      estimate_accuracy: profile.estimate_accuracy,
      common_blocks: profile.common_blocks,
      effective_interventions: profile.effective_interventions,
      profile_confidence: profile.profile_confidence,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return profile;
}

/** Interventions this person has accepted before, best first (§10, §13). */
export function rankEffectiveInterventions(profile: {
  effective_interventions?: Record<string, { accepted: number; offered: number }> | null;
}): string[] {
  const entries = Object.entries(profile.effective_interventions ?? {});
  return entries
    .filter(([, stats]) => stats.offered > 0 && stats.accepted > 0)
    .sort((a, b) => b[1].accepted / b[1].offered - a[1].accepted / a[1].offered)
    .slice(0, 3)
    .map(([type]) => type);
}

/** The window where this person most reliably finishes work (§10). */
export function bestWindow(profile: {
  completion_by_time?: Record<string, { completed: number; total: number }> | null;
}): "morning" | "afternoon" | "evening" | "varies" {
  const entries = Object.entries(profile.completion_by_time ?? {}).filter(
    ([, stats]) => stats.total >= 3,
  );
  if (entries.length === 0) return "varies";

  const best = entries.reduce((top, entry) =>
    entry[1].completed / entry[1].total > top[1].completed / top[1].total ? entry : top,
  );
  return best[1].completed / best[1].total >= 0.5
    ? (best[0] as "morning" | "afternoon" | "evening")
    : "varies";
}
