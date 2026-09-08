"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { APP_NAV, currentNavHref } from "@/lib/nav";

/**
 * Signed-in navigation, desktop and mobile.
 *
 * The current destination is marked two ways, and both matter:
 *
 *   aria-current="page"  what a screen reader announces. Exactly one item
 *                        carries it — currentNavHref resolves the longest
 *                        match, because two items marked current tells someone
 *                        they are in two places at once.
 *   weight + an underline
 *                        WCAG 1.4.1: colour alone is not an indicator. Someone
 *                        who cannot separate berry from mauve still sees a
 *                        semibold label with a rule under it.
 *
 * Route matching is by segment (see lib/nav.ts), so /goals/abc/review keeps My
 * Goals current while a hypothetical /goalsomething does not.
 */
function navClass(current: boolean): string {
  return [
    "relative text-[0.95rem] transition-colors",
    current
      ? "font-semibold text-berry after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-berry after:content-['']"
      : "font-medium text-mauve hover:text-berry",
  ].join(" ");
}

export default function AppNav() {
  const pathname = usePathname() ?? "";
  const current = currentNavHref(pathname);
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Primary" className="hidden items-center gap-6 sm:flex">
        {APP_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current === item.href ? "page" : undefined}
            className={navClass(current === item.href)}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* The nav did not fit at 375px — three links, a bell and Sign out
          overflowed the viewport by 125px. It collapses now. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="app-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-blush text-berry sm:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
        </svg>
      </button>

      {open && (
        <nav
          id="app-mobile-menu"
          aria-label="Primary"
          className="absolute inset-x-0 top-full border-b border-blush bg-white px-5 py-4 shadow-soft sm:hidden"
        >
          <ul className="space-y-3">
            {APP_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={current === item.href ? "page" : undefined}
                  className={
                    current === item.href
                      ? "flex items-center gap-2 font-semibold text-berry before:h-4 before:w-1 before:rounded-full before:bg-berry before:content-['']"
                      : "flex items-center gap-2 font-medium text-mauve before:h-4 before:w-1 before:content-['']"
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
