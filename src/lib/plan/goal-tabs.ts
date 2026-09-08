/**
 * The five views of a single goal.
 *
 * Each one is a real URL (`/goals/<id>?view=week`), not client-only state, so
 * a view survives a reload, can be linked to and can be shared. That is also
 * what makes `aria-current="page"` the right semantic on the switcher: the
 * selected tab really is the page you are on.
 *
 * `plan` is deliberately the ONLY place the whole milestone list is rendered.
 * The page used to repeat all thirty-four of them in a "Progress" section
 * under a view that was already scoped to today, which meant scrolling past
 * the entire plan to reach the three things that actually needed doing.
 */

import { goalPath } from "@/lib/routes";

export type GoalTab = "overview" | "today" | "week" | "month" | "plan";

export const GOAL_TABS: readonly { id: GoalTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "plan", label: "Full Plan" },
] as const;

/**
 * Today, not Overview.
 *
 * The goal page is opened to answer "what does this need from me now?", and
 * every link into it from Today, My Goals and the reminder emails means that
 * question. Overview is where you go when you want to step back.
 */
export const DEFAULT_GOAL_TAB: GoalTab = "today";

export function isGoalTab(value: string | null | undefined): value is GoalTab {
  return GOAL_TABS.some((tab) => tab.id === value);
}

export function goalTabPath(goalId: string, tab: GoalTab): string {
  return `${goalPath(goalId)}?view=${tab}`;
}

/**
 * The rolling window a tab maps onto, for the two that are windows.
 *
 * Today is not one of them: it is a selection (what needs attention now),
 * not everything that happens to fall inside a nought-day span — see
 * lib/plan/goal-today.ts.
 */
export function windowFor(tab: GoalTab): "week" | "month" | null {
  return tab === "week" || tab === "month" ? tab : null;
}
