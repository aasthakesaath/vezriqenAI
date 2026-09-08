/**
 * A ring that means exactly one thing: how many of a goal's tasks are done.
 *
 * §15 is explicit that Goal Health "must be more than percent of tasks
 * completed", and §4.10 that finishing low-value work must not make a goal
 * look healthier than it is. A ring that turned green at 80% and orange at 55%
 * would say precisely that — it would read as the health verdict, which is
 * computed elsewhere from eight deterministic factors and is shown beside this
 * as its own pill.
 *
 * Two things keep the two apart. The ring is ONE colour at every value, so it
 * carries a quantity and never a judgement. And it always says what it counts:
 * `caption` is not decoration, it is the difference between "62% of tasks
 * done" and an unlabelled 62% that the reader will assume is a likelihood.
 */
export default function ProgressRing({
  percent,
  caption = "of tasks done",
  className = "",
}: {
  /** 0–100. Rounded by the caller; clamped here so a bad input cannot draw outside the ring. */
  percent: number;
  caption?: string;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="h-16 w-16 -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth={6}
            className="stroke-blush-light"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth={6}
            strokeLinecap="round"
            className="stroke-berry"
            strokeDasharray={circumference}
            // The gap is the remainder, so 0% draws nothing and 100% closes.
            strokeDashoffset={circumference * (1 - value / 100)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[0.95rem] font-bold text-ink">
          {value}%
        </span>
      </div>
      <span className="mt-1 text-center text-[0.7rem] font-medium leading-tight text-mauve-light">
        {caption}
      </span>
    </div>
  );
}
