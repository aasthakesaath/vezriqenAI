import Link from "next/link";
import { PLAN_VIEWS, type PlanView } from "@/lib/plan/views";

/**
 * Today / Week / Month, as a segmented control.
 *
 * Links rather than a JavaScript tablist, deliberately. Each view is a real
 * URL, so it is shareable, survives a reload and works before hydration; links
 * are keyboard operable without a roving tabindex of our own; and aria-current
 * on the selected one is exactly the right semantic for "this link is the page
 * you are on". USWDS's own guidance is to reach for the simpler component
 * first, and a tablist here would be a heavier one that behaves worse.
 *
 * Not an accordion: these are three views of the same plan, not three
 * disclosures, and only one is ever wanted at a time.
 */
export default function PlanViewTabs({
  goalId,
  current,
}: {
  goalId: string;
  current: PlanView;
}) {
  return (
    <nav aria-label="Plan view" className="mt-6">
      <ul className="inline-flex rounded-pill border border-blush bg-white p-1">
        {PLAN_VIEWS.map((view) => {
          const active = view.id === current;
          return (
            <li key={view.id}>
              <Link
                href={`/goals/${goalId}?view=${view.id}`}
                aria-current={active ? "page" : undefined}
                // Weight as well as colour: WCAG 1.4.1 means the selected view
                // must be distinguishable without relying on berry-vs-mauve.
                className={[
                  "block rounded-pill px-4 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-berry font-semibold text-white"
                    : "font-medium text-mauve hover:bg-blush-wash hover:text-berry",
                ].join(" ")}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
