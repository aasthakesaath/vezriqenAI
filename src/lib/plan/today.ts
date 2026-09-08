/**
 * Choosing what to show on Today (PRD §17, §4.5).
 *
 * "Three important things beat 30 tasks." The cap is the feature, so this is a
 * selection problem rather than a filter: from everything open, pick the few
 * whose absence today would actually cost the user something.
 */

export type CandidateTask = {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  rationale: string | null;
  taskType: string;
  priority: number;
  deadline: Date | null;
  startBy: Date | null;
  estimatedMinutes: number | null;
  status: string;
  /** True when a checkpoint for this task came due and was never answered. */
  awaitingCheckpoint: boolean;
  /** True when the task is blocked on another person (§13 "not in your control"). */
  blockedOnPerson: boolean;
};

export type TodayCard = CandidateTask & { urgencyScore: number; reason: string };

const DAY = 24 * 60 * 60 * 1000;

const OPEN_STATUSES = new Set(["not_started", "in_progress", "unconfirmed", "partial"]);

/**
 * How much it costs to not do this today.
 *
 * Deliberately not "most overdue first": how far a task has slipped matters,
 * but so does its priority and whether Vezri is missing information about it.
 */
function score(task: CandidateTask, now: Date): { score: number; reason: string } {
  let value = (6 - task.priority) * 10;
  const reasons: string[] = [];

  if (task.startBy) {
    const daysUntilStart = (task.startBy.getTime() - now.getTime()) / DAY;
    if (daysUntilStart < 0) {
      value += Math.min(40, 15 + Math.abs(daysUntilStart) * 2);
      reasons.push("this should already have started");
    } else if (daysUntilStart <= 1) {
      value += 15;
      reasons.push("today is the day to start");
    } else if (daysUntilStart <= 3) {
      value += 6;
    }
  }

  if (task.deadline) {
    const daysUntilDue = (task.deadline.getTime() - now.getTime()) / DAY;
    if (daysUntilDue < 0) {
      value += 25;
      reasons.push("the deadline has passed");
    } else if (daysUntilDue <= 3) {
      value += 20;
      reasons.push("the deadline is close");
    } else if (daysUntilDue <= 14) {
      value += 8;
    }
  }

  // An unanswered checkpoint is missing information, and §12 says never assume.
  if (task.awaitingCheckpoint) {
    value += 12;
    reasons.push("Vezri doesn't know how this went");
  }

  return {
    score: value,
    reason: reasons[0] ?? task.rationale ?? "this moves your goal forward",
  };
}

/**
 * Picks the day's cards.
 *
 * Spread across goals comes before depth within one: three tasks from the same
 * goal would hide a second goal drifting entirely, which §18 and §15 both care
 * about. Only when there are fewer goals than slots does a goal get a second card.
 */
export function selectTodayCards(
  candidates: CandidateTask[],
  options: { now?: Date; limit?: number } = {},
): TodayCard[] {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 3;

  // §13 — "This is not in your control right now. I'll ... move you to the next
  // task that does not depend on them." Blocked work is excluded from the
  // priority slots outright rather than merely demoted: a scoring penalty can
  // always be out-weighed by a high enough priority, which would put an
  // un-actionable card at the top of someone's day. It stays visible through
  // selectWaitingOn.
  const open = candidates.filter((t) => OPEN_STATUSES.has(t.status) && !t.blockedOnPerson);
  if (open.length === 0) return [];

  const scored: TodayCard[] = open
    .map((task) => {
      const { score: urgencyScore, reason } = score(task, now);
      return { ...task, urgencyScore, reason };
    })
    .sort((a, b) => b.urgencyScore - a.urgencyScore);

  const chosen: TodayCard[] = [];
  const goalsUsed = new Set<string>();

  for (const card of scored) {
    if (chosen.length >= limit) break;
    if (goalsUsed.has(card.goalId)) continue;
    chosen.push(card);
    goalsUsed.add(card.goalId);
  }

  // Backfill only once every goal has had a turn.
  for (const card of scored) {
    if (chosen.length >= limit) break;
    if (chosen.some((c) => c.id === card.id)) continue;
    chosen.push(card);
  }

  return chosen;
}

/**
 * Follow-ups the user cannot act on themselves, shown apart from the day's work
 * so they neither disappear nor take a priority slot (§13 waiting-on-someone).
 */
export function selectWaitingOn(candidates: CandidateTask[]): CandidateTask[] {
  return candidates
    .filter((t) => OPEN_STATUSES.has(t.status) && t.blockedOnPerson)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);
}
