"use client";

import { useId, useState } from "react";

/**
 * A single disclosure, following the USWDS accordion pattern.
 *
 * https://designsystem.digital.gov/components/accordion/ — the rules that
 * actually matter and are usually the ones dropped:
 *
 *  - the header is a real <button>, so it is reachable and operable by
 *    keyboard without any handler of ours;
 *  - aria-expanded says which state it is in, aria-controls says what it
 *    owns, and the panel's id matches;
 *  - the panel stays IN THE DOM and is hidden with the `hidden` attribute
 *    rather than unmounted, so in-page find still reaches the text and a
 *    screen reader's virtual cursor is not surprised by content appearing
 *    from nowhere.
 *
 * Deliberately not a kebab menu: three dots promise a list of actions, and
 * this is one piece of content one tap away.
 *
 * Deliberately not nestable — the caller cannot put one inside another,
 * because USWDS says not to and because a nested disclosure gives no reliable
 * reading order on a screen reader.
 */
export default function Disclosure({
  label,
  children,
  defaultOpen = false,
  className = "",
  headingLevel = "h3",
}: {
  /** What opens. A noun phrase, not "click here". */
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /**
   * The heading this disclosure is, in the page's outline.
   *
   * USWDS puts the button inside a heading of the level the content sits at,
   * and a level is only correct relative to what is above it: under an h1 this
   * has to be an h2, and axe reports the skipped level as a real failure. The
   * caller knows its own outline; this component cannot.
   */
  headingLevel?: "h2" | "h3" | "h4";
}) {
  const id = useId();
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;
  const [open, setOpen] = useState(defaultOpen);
  const Heading = headingLevel;

  return (
    <div className={className}>
      <Heading className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-blush bg-blush-wash px-4 py-3 text-left text-[0.95rem] font-semibold text-berry transition-colors hover:bg-blush-light"
        >
          {label}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 9l7 7 7-7" />
          </svg>
        </button>
      </Heading>
      {/* `hidden`, not unmounted: the content is still findable and still
          announced in document order when it opens. */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="rounded-b-xl border border-t-0 border-blush bg-white px-4 py-4"
      >
        {children}
      </div>
    </div>
  );
}
