import { dayKey, daysBetweenDays, formatDay } from "@/lib/time";

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

const DAY = 24 * 60 * 60 * 1000;

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
 */
function neutralReason(task: CandidateTask): string {
  if (task.rationale?.trim()) return task.rationale.trim();
  return typeReason(task);
}

/** The fallback half of the above, for callers that punctuate it themselves. */
function typeReason(task: CandidateTask): string {
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

function score(
  task: CandidateTask,
  now: Date,
  planBehind: boolean,
): { score: number; reason: string } {
  let value = (6 - task.priority) * 10;
  const reasons: string[] = [];

  if (task.startBy) {
    const daysUntilStart = (task.startBy.getTime() - now.getTime()) / DAY;
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

  if (task.deadline) {
    const daysUntilDue = (task.deadline.getTime() - now.getTime()) / DAY;
    if (daysUntilDue < 0) {
      value += 25;
      reasons.push(`the deadline was ${formatDay(task.deadline)}`);
    } else if (daysUntilDue <= 3) {
      value += 20;
      reasons.push(`it is due ${formatDay(task.deadline)}`);
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
  options: { now?: Date } = {},
): { behindCount: number; planBehind: boolean } {
  const now = options.now ?? new Date();
  const behindCount = candidates.filter(
    (t) => OPEN_STATUSES.has(t.status) && t.startBy && t.startBy.getTime() < now.getTime(),
  ).length;
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

  const { planBehind } = backlogSummary(candidates, { now });

  const scored: TodayCard[] = open
    .map((task) => {
      const { score: urgencyScore, reason } = score(task, now, planBehind);
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

/* ---------------------------------------------------------------------------
 * Today, grouped by goal (PRD §17, §4.5, §4.6)
 *
 * selectTodayCards above answers "what are the two or three things that matter
 * most across everything?" and caps at three, full stop. That is still the
 * right answer for a reminder or an email, where there is room for one list.
 *
 * The screen asks a slightly different question once someone has four goals:
 * three cards can leave a goal with two overdue items completely unmentioned,
 * and §18 cares about that. Grouping by goal answers both — each goal gets its
 * own section, and §4.5's cap is applied WITHIN a section (three rows visible,
 * the rest behind "Show N more") rather than across the screen. What is never
 * done is showing a goal's whole backlog: eligibility below is the same
 * "needs attention today" filter, not a list of everything open.
 * ------------------------------------------------------------------------- */

/** Why a task is on Today at all. The badge and the ordering both come from it. */
export type TodayUrgency = "overdue" | "due_today" | "start_today" | "needs_answer";

export type TodayTask = CandidateTask & {
  urgency: TodayUrgency;
  /** Whole days past the date that made it overdue. 0 for everything else. */
  daysOverdue: number;
  /**
   * The badge, in sentence case. "30 days overdue".
   *
   * §4.6 — a fact, not a verdict. It is uppercased by CSS at the call site so
   * the string a screen reader receives is still a sentence, and so the copy
   * here can be read as the product's tone rather than as shouting.
   */
  badge: string;
  /** The date shown on the row, and which date it is. */
  date: Date | null;
  dateKind: "deadline" | "start_by" | null;
  reason: string;
};

export type TodayGoalSection = {
  goalId: string;
  /** Raw naming columns; the page resolves them through lib/goal-label. */
  goalLabel: string | null;
  goalTitle: string;
  tasks: TodayTask[];
  overdueCount: number;
  dueTodayCount: number;
  startTodayCount: number;
  needsAnswerCount: number;
  /** "2 overdue · 3 due today" — the section header's status pill. */
  summary: string;
};

const RANK: Record<TodayUrgency, number> = {
  overdue: 0,
  due_today: 1,
  start_today: 2,
  needs_answer: 3,
};

function overdueBadge(days: number): string {
  if (days <= 0) return "Overdue";
  return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

/**
 * Is this task one of today's, and if so why?
 *
 * Returns null for work that merely exists. §17: "Do not default to a giant
 * backlog" — a task due in three weeks has no business on this screen, however
 * important it is.
 */
function classify(
  task: CandidateTask,
  todayKey: string,
  timeZone: string | undefined,
): Pick<TodayTask, "urgency" | "daysOverdue" | "badge" | "date" | "dateKind"> | null {
  const deadlineKey = task.deadline ? dayKey(task.deadline, timeZone) : null;
  const startKey = task.startBy ? dayKey(task.startBy, timeZone) : null;

  if (deadlineKey && deadlineKey < todayKey) {
    const days = daysBetweenDays(deadlineKey, todayKey);
    return {
      urgency: "overdue",
      daysOverdue: days,
      badge: overdueBadge(days),
      date: task.deadline,
      dateKind: "deadline",
    };
  }

  // Past its start-by date but not yet past its deadline. Still overdue as a
  // fact — the work was meant to be under way — and the row says "Start by"
  // rather than "Due", so the badge is not claiming a missed deadline.
  if (startKey && startKey < todayKey) {
    const days = daysBetweenDays(startKey, todayKey);
    return {
      urgency: "overdue",
      daysOverdue: days,
      badge: overdueBadge(days),
      date: task.startBy,
      dateKind: "start_by",
    };
  }

  if (deadlineKey === todayKey) {
    return {
      urgency: "due_today",
      daysOverdue: 0,
      badge: "Due today",
      date: task.deadline,
      dateKind: "deadline",
    };
  }

  if (startKey === todayKey) {
    return {
      urgency: "start_today",
      daysOverdue: 0,
      badge: "Start today",
      date: task.startBy,
      dateKind: "start_by",
    };
  }

  // §12 — a checkpoint that came due and was never answered is missing
  // information, and Vezri may not assume it went well. It needs a person
  // today even when no date says so.
  if (task.awaitingCheckpoint) {
    return {
      urgency: "needs_answer",
      daysOverdue: 0,
      badge: "Needs an answer",
      date: task.deadline ?? task.startBy,
      dateKind: task.deadline ? "deadline" : task.startBy ? "start_by" : null,
    };
  }

  return null;
}

/**
 * Today's work, split into one section per goal.
 *
 * Sections are ordered by what is most pressing inside them, not by when the
 * goal was created: the goal with two things a month overdue goes first.
 * Within a section the order is overdue, then due today, then start today,
 * then unanswered — and older slippage before newer.
 */
export function selectTodayByGoal(
  candidates: CandidateTask[],
  options: { now?: Date; timeZone?: string } = {},
): TodayGoalSection[] {
  const now = options.now ?? new Date();
  const { timeZone } = options;
  const todayKey = dayKey(now, timeZone);

  const sections = new Map<string, TodayGoalSection>();

  for (const task of candidates) {
    // Same two exclusions as the cross-goal selection: closed work, and work
    // that is not in the user's control (§13 keeps that in its own section so
    // it neither disappears nor occupies a slot the user can act on).
    if (!OPEN_STATUSES.has(task.status) || task.blockedOnPerson) continue;

    const classified = classify(task, todayKey, timeZone);
    if (!classified) continue;

    let section = sections.get(task.goalId);
    if (!section) {
      section = {
        goalId: task.goalId,
        goalLabel: task.goalLabel ?? null,
        goalTitle: task.goalTitle,
        tasks: [],
        overdueCount: 0,
        dueTodayCount: 0,
        startTodayCount: 0,
        needsAnswerCount: 0,
        summary: "",
      };
      sections.set(task.goalId, section);
    }

    section.tasks.push({ ...task, ...classified, reason: taskContextLine(task) });
  }

  const ordered = [...sections.values()];

  for (const section of ordered) {
    section.tasks.sort(
      (a, b) =>
        RANK[a.urgency] - RANK[b.urgency] ||
        b.daysOverdue - a.daysOverdue ||
        a.priority - b.priority ||
        a.title.localeCompare(b.title),
    );
    section.overdueCount = section.tasks.filter((t) => t.urgency === "overdue").length;
    section.dueTodayCount = section.tasks.filter((t) => t.urgency === "due_today").length;
    section.startTodayCount = section.tasks.filter((t) => t.urgency === "start_today").length;
    section.needsAnswerCount = section.tasks.filter((t) => t.urgency === "needs_answer").length;
    section.summary = sectionSummary(section);
  }

  // Sections are ordered by their own first row, using the SAME comparator the
  // rows inside them use. That is what makes the page read in one order: the
  // first row of the first section is the most overdue thing on the screen.
  // Ordering sections by the cross-goal urgency score instead was tried and
  // produced exactly the sentence a reader would call a bug — a goal whose
  // worst item was twelve days late sitting above one thirty days late,
  // because that scorer weights a missed start date and a missed deadline on
  // different curves.
  return ordered.sort(
    (a, b) =>
      RANK[a.tasks[0]!.urgency] - RANK[b.tasks[0]!.urgency] ||
      b.tasks[0]!.daysOverdue - a.tasks[0]!.daysOverdue ||
      b.overdueCount - a.overdueCount ||
      b.tasks.length - a.tasks.length,
  );
}

/**
 * The section header's status pill. "2 overdue · 3 due today"
 *
 * Counts only. A collapsed section must still say what is inside it, or
 * collapsing hides work rather than tidying it.
 */
export function sectionSummary(section: {
  overdueCount: number;
  dueTodayCount: number;
  startTodayCount: number;
  needsAnswerCount: number;
}): string {
  const parts = [
    section.overdueCount > 0 ? `${section.overdueCount} overdue` : null,
    section.dueTodayCount > 0 ? `${section.dueTodayCount} due today` : null,
    section.startTodayCount > 0 ? `${section.startTodayCount} to start today` : null,
    section.needsAnswerCount > 0 ? `${section.needsAnswerCount} needs an answer` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * The one line of context under a task title: why this matters.
 *
 * Never the urgency — the badge and the date already say that, and a row
 * reading "30 DAYS OVERDUE / … / Because the deadline was 10 Aug" says the
 * same thing three times, which is how a factual screen turns into a nagging
 * one (§4.6). This is the task's own rationale where the model wrote one, and
 * a sentence about the KIND of work where it did not.
 *
 * A rationale is used verbatim apart from a full stop. §7 forbids re-wording
 * what the model actually said about a plan, so it is punctuated, not edited.
 */
export function taskContextLine(task: CandidateTask): string {
  const rationale = task.rationale?.trim();
  if (rationale) return /[.!?]$/.test(rationale) ? rationale : `${rationale}.`;
  return `Because ${typeReason(task)}.`;
}
