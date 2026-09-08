import type { ReactNode } from "react";

/**
 * One icon set, drawn once.
 *
 * Not emoji. One emoji is a different drawing on every platform — flat and
 * gold here, glossy and orange there — so a screen built from them has no
 * consistent weight, no consistent optical size, and no way to inherit a
 * colour. They read aloud, too: a screen reader announces "trophy" beside a
 * heading that already says what the thing is.
 *
 * Every icon here is on the same 24 grid, stroked at the same width in
 * `currentColor` with round caps and joins, and carries no fill. That is what
 * makes a flag beside a milestone and a calendar beside a date look like they
 * came from the same hand, and it is why colour is set by the caller with a
 * text class rather than baked into the path.
 *
 * All of them are decorative: `aria-hidden` is not a prop, because a caller
 * cannot be trusted to remember it and every one of these sits beside text
 * that already says the same thing. An icon that needs a name is a picture,
 * not an icon, and belongs in an <Image> with real alt text.
 */

export type IconName =
  | "goal"
  | "trophy"
  | "calendar"
  | "clock"
  | "flag"
  | "check"
  | "chevronLeft"
  | "chevronRight"
  | "chevronDown"
  | "document"
  | "health"
  | "heart"
  // Goal identity (see lib/goal-icon.ts) and the Today row markers. Added
  // here rather than in a second file: two sets on one screen is two stroke
  // weights and two optical sizes, which is exactly what "one icon set" is
  // for. `goal` doubles as the neutral default for a goal nothing matches.
  | "book"
  | "graduation"
  | "briefcase"
  | "fitness"
  | "rocket"
  | "pen"
  | "globe"
  | "history"
  | "list"
  | "plus";

const PATHS: Record<IconName, ReactNode> = {
  goal: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 1.5v2.25M12 20.25v2.25M1.5 12h2.25M20.25 12h2.25" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 3.75h8v4.5a4 4 0 0 1-8 0v-4.5Z" />
      <path d="M8 5.25H5.5a2.25 2.25 0 0 0 0 4.5H7M16 5.25h2.5a2.25 2.25 0 0 1 0 4.5H17" />
      <path d="M12 12.25v3.5M9 20.25h6M10.25 15.75h3.5l.75 4.5h-5l.75-4.5Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.25" y="5" width="17.5" height="15.75" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.25 10h17.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.25V12l3 1.75" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21.25V3.75" />
      <path d="M6 4.75h11l-2 3.75 2 3.75H6" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.25 12.25 2.5 2.5 5-5.5" />
    </>
  ),
  chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <path d="m5.5 9 6.5 6.5L18.5 9" />,
  document: (
    <>
      <path d="M14 2.75H7.5A1.75 1.75 0 0 0 5.75 4.5v15A1.75 1.75 0 0 0 7.5 21.25h9a1.75 1.75 0 0 0 1.75-1.75V7L14 2.75Z" />
      <path d="M13.75 3v4h4.25M9 13h6M9 16.75h4" />
    </>
  ),
  health: <path d="M2.75 12.25h4l2.25-5.5 3.75 11 2.5-5.5h5" />,
  book: (
    <>
      <path d="M12 7.1C10.5 5.8 8.6 5.1 6.4 5.1H3.8v11.6h2.6c2.2 0 4.1.7 5.6 2" />
      <path d="M12 7.1c1.5-1.3 3.4-2 5.6-2h2.6v11.6h-2.6c-2.2 0-4.1.7-5.6 2" />
      <path d="M12 7.1v11.6" />
    </>
  ),
  graduation: (
    <>
      <path d="M12 4 2.6 8.8 12 13.6l9.4-4.8L12 4Z" />
      <path d="M6.6 11v4.6c0 1.4 2.4 2.6 5.4 2.6s5.4-1.2 5.4-2.6V11" />
      <path d="M21.4 8.8v5.4" />
    </>
  ),
  briefcase: (
    <>
      <path d="M4.2 8.6h15.6a1.4 1.4 0 0 1 1.4 1.4v8.2a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4V10a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M9 8.6V6.8A1.8 1.8 0 0 1 10.8 5h2.4A1.8 1.8 0 0 1 15 6.8v1.8" />
      <path d="M2.8 13.2h18.4" />
    </>
  ),
  fitness: (
    <>
      <path d="M3.4 9.4v5.2M6.6 7.2v9.6M17.4 7.2v9.6M20.6 9.4v5.2" />
      <path d="M6.6 12h10.8" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3.2c2.9 2.2 4.6 5.7 4.6 9.4L14.3 15H9.7l-2.3-2.4c0-3.7 1.7-7.2 4.6-9.4Z" />
      <path d="M9.7 15 8 19.4l3.1-1.3M14.3 15l1.7 4.4-3.1-1.3" />
      <circle cx="12" cy="9.8" r="1.5" />
    </>
  ),
  pen: (
    <>
      <path d="M4.4 19.6h3.4L19.5 7.9a2 2 0 0 0-2.8-2.8L5 16.8v2.8Z" />
      <path d="M14.6 7.2 17.4 10" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.6 12h16.8" />
      <path d="M12 3.6c2.2 2.3 3.4 5.3 3.4 8.4S14.2 18.1 12 20.4c-2.2-2.3-3.4-5.3-3.4-8.4S9.8 5.9 12 3.6Z" />
    </>
  ),
  // A clock wound back. The marker on an overdue row: time has passed, which
  // is the fact. An exclamation mark says you should feel something about it,
  // which §4.6 rules out.
  history: (
    <>
      <path d="M3.4 9.2A9 9 0 1 1 3 12" />
      <path d="M3.1 4.6v4.6h4.6" />
      <path d="M12 7.8V12l2.8 1.7" />
    </>
  ),
  list: <path d="M8.4 6.4h11.2M8.4 12h11.2M8.4 17.6h11.2M4.4 6.4h.01M4.4 12h.01M4.4 17.6h.01" />,
  plus: <path d="M12 5.4v13.2M5.4 12h13.2" />,
  heart: <path d="M12 20.25s-7.25-4.4-7.25-9.25a3.9 3.9 0 0 1 7.25-2.4 3.9 3.9 0 0 1 7.25 2.4c0 4.85-7.25 9.25-7.25 9.25Z" />,
};

export default function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
