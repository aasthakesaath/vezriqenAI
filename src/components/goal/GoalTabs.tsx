import Link from "next/link";
import { GOAL_TABS, goalTabPath, type GoalTab } from "@/lib/plan/goal-tabs";

/**
 * Overview · Today · Week · Month · Full Plan.
 *
 * Links, not a JavaScript tablist — the same decision the three-view switcher
 * made and for the same reasons. Each view is a real URL, so it is shareable,
 * survives a reload and works before hydration; links are keyboard operable
 * with no roving tabindex of ours; and `aria-current="page"` is exactly the
 * right semantic for "this link is the page you are on". A tablist here would
 * be a heavier component that behaves worse.
 *
 * The strip scrolls sideways when five tabs will not fit rather than wrapping
 * into two rows: a wrapped pill row reads as two groups. The scroll is on this
 * element alone, so the PAGE never scrolls sideways with it.
 */
export default function GoalTabs({ goalId, current }: { goalId: string; current: GoalTab }) {
  return (
    // px-1 py-1 and the matching negative margin: a focus ring is drawn
    // outside the link's box and would be clipped by the scroll container.
    <nav aria-label="Goal views" className="-mx-1 mt-6 overflow-x-auto px-1 py-1">
      <ul className="inline-flex min-w-full gap-1 rounded-pill border border-blush bg-white p-1">
        {GOAL_TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id} className="flex-1">
              <Link
                href={goalTabPath(goalId, tab.id)}
                aria-current={active ? "page" : undefined}
                // Weight as well as colour: WCAG 1.4.1 means the selected view
                // has to be distinguishable without separating berry from mauve.
                className={[
                  "block whitespace-nowrap rounded-pill px-4 py-2 text-center text-sm transition-colors",
                  active
                    ? "bg-berry font-semibold text-white"
                    : "font-medium text-mauve hover:bg-blush-wash hover:text-berry",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
