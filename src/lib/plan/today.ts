import { formatDayKey } from "@/lib/time";
import {
  FALLBACK_TIME_ZONE,
  dayKeyIn,
  daysBetween,
  toDayKey,
  type DayKey,
} from "@/lib/time-zone";

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
  /** The full SMART statement. Stored, never rendered on a card. */
  goalTitle: string;
  /** Six-word cosmetic label. Null for goals extracted before it existed. */
  goalLabel?: string | null;
  /** The milestone this task belongs to — the context a card actually needs. */
  milestoneTitle?: string | null;
  /** Who the task is waiting on, when extraction flagged an external person. */
  externalPartyName?: string | null;
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

/** Milestone heading plus the cards under it, for the grouped Today list. */
export type TodayGroup = {
  milestoneTitle: string | null;
  goalId: string;
  goalLabel: string | null;
  cards: TodayCard[];
};

/**
 * Groups the day's cards under the milestone each belongs to.
 *
 * Order is preserved: the cards are already in priority order and grouping
 * must not reshuffle what the user is meant to do first.
 */
export function groupByMilestone(cards: TodayCard[]): TodayGroup[] {
  const groups: TodayGroup[] = [];
  for (const card of cards) {
    const key = card.milestoneTitle ?? null;
    const existing = groups.find((g) => g.milestoneTitle === key && g.goalId === card.goalId);
    if (existing) {
      existing.cards.push(card);
      continue;
    }
    groups.push({
      milestoneTitle: key,
      goalId: card.goalId,
      goalLabel: card.goalLabel ?? null,
      cards: [card],
    });
  }
  return groups;
}

const OPEN_STATUSES = new Set(["not_started", "in_progress", "unconfirmed", "partial"]);

/**
 * How much it costs to not do this today.
 *
 * Deliberately not "most overdue first": how far a task has slipped matters,
 * but so does its priority and whether Vezri is missing information about it.
 */
/**
 * A line about the task, when the plan-level "you're behind" line has already
 * been said at the top of the screen.
 *
 * §4 forbids guilt. Three cards each repeating "this should already have
 * started" is not three facts, it is the same reproach three times — which is
 * how a screen full of overdue work ends up reading as a telling-off. The
 * task's own rationale is the best answer because the model wrote it about
 * THIS task; the type lines are the fallback, and each one describes the work
 * rather than the person.
 *
 * Exported because the goal page's Today list needs the same sentence for the
 * same reason. One wording, one place to change it.
 */
export function neutralReason(task: { rationale: string | null; taskType: string }): string {
  if (task.rationale?.trim()) return task.rationale.trim();
  return typeReason(task);
}

/** The fallback half of the above, for callers that punctuate it themselves. */
function typeReason(task: { taskType: string }): string {
  switch (task.taskType) {
    case "external_dependency":
      return "someone else has to act before this can close";
    case "submission":
      return "it has a hard cut-off";
    case "deep_work":
      return "it needs a proper block of focus";
    case "study_prep":
      return "what comes next builds on it";
    case "routine_habit":
      return "it is small, and easy to pick back up";
    case "approval_review":
      return "it is waiting on a decision";
    default:
      return "it is the next thing that moves this forward";
  }
}

/**
 * Which day it is where the user is.
 *
 * Not where the server is. Vercel runs in UTC, so at 8 PM in Texas the code
 * thought it was already tomorrow: a task due today read as overdue, and one
 * due tomorrow read as due today.
 */
export function todayFor(options: { now?: Date; timeZone?: string } = {}): DayKey {
  return dayKeyIn(options.now ?? new Date(), options.timeZone ?? FALLBACK_TIME_ZONE);
}

function score(
  task: CandidateTask,
  today: DayKey,
  planBehind: boolean,
): { score: number; reason: string } {
  let value = (6 - task.priority) * 10;
  const reasons: string[] = [];

  const startBy = toDayKey(task.startBy);
  const deadline = toDayKey(task.deadline);

  if (startBy) {
    const daysUntilStart = daysBetween(today, startBy);
    if (daysUntilStart < 0) {
      value += Math.min(40, 15 + Math.abs(daysUntilStart) * 2);
      // Said once at the top of the screen when the whole plan is behind, so
      // the card says something about the work instead.
      if (!planBehind) reasons.push("this should already have started");
    } else if (daysUntilStart <= 1) {
      value += 15;
      reasons.push("today is the day to start");
    } else if (daysUntilStart <= 3) {
      value += 6;
    }
  }

  if (deadline) {
    const daysUntilDue = daysBetween(today, deadline);
    if (daysUntilDue < 0) {
      value += 25;
      reasons.push(`the deadline was ${formatDayKey(deadline)}`);
    } else if (daysUntilDue <= 3) {
      value += 20;
      reasons.push(`it is due ${formatDayKey(deadline)}`);
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
    reason: reasons[0] ?? neutralReason(task),
  };
}

/**
 * How far behind the plan is, for the one line at the top of Today.
 *
 * Two or more tasks past their start date is a plan slipping, not a task
 * slipping — and it is the case where repeating it per card turns into
 * nagging.
 */
export function backlogSummary(
  candidates: CandidateTask[],
  options: { now?: Date; timeZone?: string } = {},
): { behindCount: number; planBehind: boolean } {
  const today = todayFor(options);
  const behindCount = candidates.filter((t) => {
    const startBy = toDayKey(t.startBy);
    return OPEN_STATUSES.has(t.status) && startBy !== null && startBy < today;
  }).length;
  return { behindCount, planBehind: behindCount >= 2 };
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
  options: { now?: Date; timeZone?: string; limit?: number } = {},
): TodayCard[] {
  const today = todayFor(options);
  const limit = options.limit ?? 3;

  // §13 — "This is not in your control right now. I'll ... move you to the next
  // task that does not depend on them." Blocked work is excluded from the
  // priority slots outright rather than merely demoted: a scoring penalty can
  // always be out-weighed by a high enough priority, which would put an
  // un-actionable card at the top of someone's day. It stays visible through
  // selectWaitingOn.
  const open = candidates.filter((t) => OPEN_STATUSES.has(t.status) && !t.blockedOnPerson);
  if (open.length === 0) return [];

  const { planBehind } = backlogSummary(candidates, options);

  const scored: TodayCard[] = open
    .map((task) => {
      const { score: urgencyScore, reason } = score(task, today, planBehind);
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

/**
 * The one line of context under a task title, as a finished sentence.
 *
 * The two screens each punctuated this themselves and got different answers:
 * the goal page rendered "Because {reason}." around whatever came back, which
 * turned a model-written sentence into "Because This is a key piece of
 * independent validation." — a capital letter mid-sentence and a clause that
 * does not parse. /today rendered it bare, which left the type fallbacks as
 * sentence fragments.
 *
 * So the sentence is built once, here. A rationale is used verbatim apart from
 * a full stop: §7 forbids re-wording what the model actually said about a
 * plan, so it is punctuated, not edited. Only the fallback, which this file
 * wrote itself, gets the "Because" it was phrased for.
 */
export function taskContextLine(task: { rationale: string | null; taskType: string }): string {
  const rationale = task.rationale?.trim();
  if (rationale) return /[.!?]$/.test(rationale) ? rationale : `${rationale}.`;
  return `Because ${typeReason(task)}.`;
}
