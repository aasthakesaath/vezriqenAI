/**
 * The sections /settings is made of, in the order it renders them.
 *
 * One list, so the jump nav and the page cannot drift into disagreeing about
 * what is on the page — a nav item pointing at a heading that no longer exists
 * scrolls nowhere and says nothing about why.
 *
 * The target is the section's HEADING, not the section. Each heading already
 * carries a unique id, because each section already labels itself by it
 * (aria-labelledby), so there is no new id to invent and none to collide with
 * — `id="timezone"` was already taken by the time zone <select>. Landing on
 * the heading is also what a screen reader wants: the fragment target is the
 * name of the thing you asked to go to.
 */
export const SETTINGS_SECTIONS = [
  { target: "timezone-heading", label: "Time zone" },
  { target: "reminders-heading", label: "Reminders" },
  { target: "calendar-heading", label: "Calendar" },
  { target: "delete-account-heading", label: "Delete account" },
] as const;

export type SettingsSectionTarget = (typeof SETTINGS_SECTIONS)[number]["target"];

/**
 * Clears the sticky app header (4.5rem) when a jump link lands, plus room to
 * breathe. Without it the heading you asked for sits underneath the header.
 *
 * Applied to every section heading; tests/settings-nav.test.tsx fails if one
 * is missing it, because the failure is silent and only visible on a device.
 */
export const HEADING_SCROLL_MARGIN = "scroll-mt-24";
