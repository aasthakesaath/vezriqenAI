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
  | "heart";

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
