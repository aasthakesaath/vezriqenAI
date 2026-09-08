import Link from "next/link";
import Image from "next/image";
import AppNav from "./AppNav";
import ReminderBell, { type BellReminder } from "./ReminderBell";
import { BRAND } from "@/lib/site";
import { APP_ROUTES } from "@/lib/routes";

/**
 * Chrome for the signed-in product. Quieter than the marketing header — no
 * conversion CTAs — but still branded Vezriqen AI™ everywhere (PRD §30.7).
 */
export default function AppHeader({
  timeZone,
  name,
  reminders = [],
}: {
  name?: string | null;
  reminders?: BellReminder[];
  /** The user's zone, for the reminder times in the bell. */
  timeZone: string;
}) {
  return (
    // Opaque, not bg-white/90 + backdrop-blur. A translucent sticky header lets
    // the page show through it: on Settings the reminder pills ghosted behind
    // the wordmark and every card was sheared off mid-line at the header's
    // bottom edge, which reads as broken rendering rather than as a frosted
    // effect. backdrop-blur goes with it — it does nothing behind an opaque
    // surface except cost a compositing layer.
    // `relative` so the mobile menu can anchor to the header rather than the page.
    <header className="sticky top-0 z-50 border-b border-blush/60 bg-white">
      <div className="shell relative flex h-[4.5rem] items-center justify-between gap-3">
        <Link
          href={APP_ROUTES.today}
          className="flex min-w-0 items-center gap-2.5"
          aria-label={`${BRAND} home`}
        >
          <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full bg-blush-wash ring-1 ring-blush">
            <Image src="/brand/vezri-avatar.webp" alt="" width={256} height={256} className="h-full w-full" />
          </span>
          <span className="truncate text-[1.15rem] font-bold tracking-tight text-berry sm:text-[1.35rem]">
            {BRAND}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          <AppNav />
          <ReminderBell reminders={reminders} timeZone={timeZone} />
          <form action="/api/auth/signout" method="post" className="hidden sm:block">
            <button
              type="submit"
              className="rounded-pill border border-blush px-4 py-2 text-sm font-semibold text-berry transition-colors hover:bg-blush-wash"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
      {name ? <span className="sr-only">Signed in as {name}</span> : null}
    </header>
  );
}
