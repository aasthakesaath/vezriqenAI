"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Wordmark from "@/components/Wordmark";
import { CTA_PRIMARY, HEADER_NAV, ROUTES } from "@/lib/site";

export default function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-blush/50 bg-white/90 backdrop-blur">
      <div className="shell flex h-[4.5rem] items-center justify-between gap-4">
        <Wordmark />

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {HEADER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[0.95rem] font-medium text-mauve transition-colors hover:text-berry"
            >
              {item.label}
            </Link>
          ))}
          <Link href={ROUTES.signIn} className="btn-secondary px-5 py-2 text-[0.95rem]">
            Sign In
          </Link>
          <Link href={ROUTES.signUp} className="btn-primary px-6 py-2.5 text-[0.95rem]">
            {CTA_PRIMARY}
          </Link>
        </nav>

        {/* Mobile: keep Sign Up Free visually prominent (PRD §30.4). */}
        <div className="flex items-center gap-2 lg:hidden">
          <Link href={ROUTES.signUp} className="btn-primary px-4 py-2 text-sm">
            {CTA_PRIMARY}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-blush text-berry"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Primary mobile" className="border-t border-blush/50 bg-white lg:hidden">
          <ul className="shell flex flex-col py-2">
            {[...HEADER_NAV, { label: "Sign In", href: ROUTES.signIn }].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-3.5 text-base font-medium text-mauve hover:text-berry"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
