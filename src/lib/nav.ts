import { APP_ROUTES } from "@/lib/routes";

/**
 * The signed-in product's destinations.
 *
 * Three. /reminders is deliberately absent: a reminder centre is a surface,
 * not a place you go, and it now lives behind the bell in the header. Nothing
 * about that removes its home — a reminder must always have somewhere to
 * appear, and the bell is it.
 */
export const APP_NAV = [
  { href: APP_ROUTES.today, label: "Today" },
  { href: APP_ROUTES.goals, label: "My Goals" },
  { href: APP_ROUTES.settings, label: "Settings" },
] as const;

/**
 * Whether a nav destination is the one currently open.
 *
 * Segment match, not startsWith: "/" startsWith-matches every path, and
 * "/goalsomething" startsWith-matches "/goals". A path belongs to a
 * destination when it IS that path or continues it at a segment boundary, so
 * /goals/abc/review still marks My Goals current while /goalsomething does not.
 */
export function isCurrentNav(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The one destination to mark, or null.
 *
 * Longest match wins, so a future nested destination cannot light up its
 * parent as well — aria-current="page" on two items tells a screen reader
 * user they are in two places at once.
 */
export function currentNavHref(pathname: string): string | null {
  const matches = APP_NAV.filter((item) => isCurrentNav(pathname, item.href));
  if (matches.length === 0) return null;
  return matches.reduce((longest, item) =>
    item.href.length > longest.href.length ? item : longest,
  ).href;
}
