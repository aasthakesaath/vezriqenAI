import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * Jump links to the sections of /settings.
 *
 * Plain anchors, not a JavaScript tab strip — the same decision GoalTabs made,
 * and it matters more here: these are fragments of ONE page, so they work
 * before hydration, they are keyboard operable with nothing of ours involved,
 * and the browser's own back behaviour returns you up the page.
 *
 * No aria-current. Every link addresses the same page, so nothing here is "the
 * page you are on"; marking one would be a claim the markup cannot support.
 *
 * "Delete account" is listed like any other section because that is all this
 * is — scrolling to it does nothing. The control it lands on is unchanged:
 * still two steps, still a typed phrase.
 */
export default function SettingsNav() {
  return (
    // px-1 py-1 with the matching negative margin: a focus ring is drawn
    // outside the link's box and would be clipped by the scroll container.
    <nav aria-label="Settings sections" className="-mx-1 mt-6 overflow-x-auto px-1 py-1">
      <ul className="inline-flex min-w-full gap-1 rounded-pill border border-blush bg-white p-1">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.target} className="flex-1">
            <a
              href={`#${section.target}`}
              className="block whitespace-nowrap rounded-pill px-4 py-2 text-center text-sm font-medium text-mauve transition-colors hover:bg-blush-wash hover:text-berry focus-visible:bg-blush-wash focus-visible:text-berry"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
