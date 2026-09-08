import Image from "next/image";
import { BRAND, MASCOT } from "@/lib/site";

const TASKS = [
  { label: "Review SAT practice test (30 min)", done: true },
  { label: "Math practice problems (25 min)", done: false },
  { label: "Read 1 chapter (AP Psychology)", done: false },
  { label: "Plan tomorrow", done: false },
];

const WEEK = [
  { day: "M", value: 0.85 },
  { day: "T", value: 0.55 },
  { day: "W", value: 1 },
  { day: "T", value: 0.4 },
  { day: "F", value: 0.7 },
  { day: "S", value: 0.3 },
  { day: "S", value: 0.6 },
];

/**
 * Static, illustrative composition of the authenticated Today screen (PRD §30.5).
 * Nothing here is interactive: the real product UI is governed by §17–§18.
 */
export default function ProgressPreview() {
  return (
    <figure className="m-0">
      <div className="flex items-end justify-center gap-4 sm:gap-6">
        {/* Desktop panel */}
        <div className="w-full max-w-[30rem] rounded-2xl border border-blush/70 bg-white p-5 shadow-lift">
          <div className="flex items-center justify-between border-b border-blush/50 pb-3">
            <span className="text-sm font-bold text-berry">{BRAND}</span>
            <span className="text-xs text-mauve-light">Today</span>
          </div>

          <p className="mt-4 text-lg font-semibold text-ink">
            Good morning, Nikita <span aria-hidden="true">&#128075;</span>
          </p>
          <p className="text-sm text-mauve">Here&rsquo;s your plan for today.</p>

          <ul className="mt-4 space-y-2">
            {TASKS.map((task) => (
              <li
                key={task.label}
                className="flex items-center gap-3 rounded-xl border border-blush/50 bg-blush-wash/40 px-3 py-2.5"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    task.done ? "border-berry bg-berry text-white" : "border-rose-soft bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {task.done && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  )}
                </span>
                <span className={`text-sm ${task.done ? "text-mauve-light line-through" : "text-ink"}`}>
                  {task.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-blush-light px-3 py-2.5">
            <Image
              src="/brand/vezri-avatar.webp"
              alt=""
              width={256}
              height={256}
              className="h-9 w-9 shrink-0 rounded-full"
            />
            <p className="text-sm text-mauve">
              You&rsquo;re doing great. Small steps, big wins.
            </p>
            <span className="ml-auto shrink-0 rounded-pill border border-berry/40 px-3 py-1 text-xs font-semibold text-berry">
              I&rsquo;m Stuck
            </span>
          </div>
        </div>

        {/* Goal Health card */}
        <div className="hidden w-40 shrink-0 rounded-2xl border border-blush/70 bg-white p-4 text-center shadow-lift sm:block">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-mauve-light">
            My Progress
          </p>
          <div className="relative mx-auto mt-3 h-24 w-24">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#F7E7EA" strokeWidth="4" />
              <circle
                cx="18" cy="18" r="15.5" fill="none" stroke="#A82449" strokeWidth="4"
                strokeLinecap="round" strokeDasharray="97.4" strokeDashoffset="24.3"
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-ink">3/4</span>
              <span className="text-[0.65rem] text-mauve-light">tasks today</span>
            </span>
          </div>
          <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-wide text-mauve-light">
            This week
          </p>
          <div className="mt-2 flex items-end justify-between gap-1" aria-hidden="true">
            {WEEK.map((d, i) => (
              <span key={i} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className="w-full rounded-sm bg-rose-soft"
                  style={{ height: `${8 + d.value * 26}px` }}
                />
                <span className="text-[0.55rem] text-mauve-light">{d.day}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        An illustrative preview of the {MASCOT} Today screen, showing a short list of the day&rsquo;s
        tasks and a progress indicator.
      </figcaption>
    </figure>
  );
}
